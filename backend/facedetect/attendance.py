"""
ArcFace + Facenet512 Ensemble Face-Attendance System
=====================================================
Uses TWO pre-trained models (ArcFace + Facenet512) with MTCNN eye-keypoint
face alignment for state-of-the-art recognition.
NO training required – builds an embedding gallery from student photos.

Pipeline (per face):
  1. MTCNN detection  (confidence >= MTCNN_DETECT_CONF)
  2. Eye-keypoint face alignment (critical for ArcFace accuracy)
  3. Passive liveness – LBP / blue-excess / glare / skin-ratio
  4. Active  liveness – blink detection
  5. Ensemble embedding (ArcFace 512-d + Facenet512 512-d, concatenated)
  6. Cosine similarity vs stored gallery  -> reject unknowns
  7. Confirm-frames buffer -> mark PRESENT
"""

import cv2
import numpy as np
import os, csv, time, logging, pickle
from datetime import datetime
from pathlib import Path

import requests
from pymongo import MongoClient
from dotenv import load_dotenv
import getpass
import bcrypt

from mtcnn import MTCNN
from deepface import DeepFace
from scipy.spatial.distance import cosine as cosine_distance

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

# ─── Environment ──────────────────────────────────────────────────────────────
BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if BACKEND_ENV_PATH.exists():
    load_dotenv(dotenv_path=BACKEND_ENV_PATH)

# ─── Config ───────────────────────────────────────────────────────────────────
MONGO_URI              = os.getenv("MONGO_URI")
MONGO_DB_NAME          = os.getenv("MONGO_DB_NAME", "test")
MONGO_USERS_COLLECTION = os.getenv("MONGO_USERS_COLLECTION", "users")

CAMERA_URL             = 0
ENSEMBLE_MODELS        = ["ArcFace", "Facenet512"]   # both used for embedding
SIM_THRESHOLD          = 0.42        # cosine similarity >= this to accept match
ALIGN_SIZE             = 112         # ArcFace standard aligned-face size

# ── CCTV / classroom settings ────────────────────────────────────────────────
# Process full-resolution so small distant faces are not downsampled further
FRAME_SCALE_FACTOR     = 1.0
CONFIRM_FRAMES         = 4           # require 4 consecutive matching frames
MTCNN_DETECT_CONF      = 0.85        # lower = catch smaller/farther faces
MTCNN_MIN_FACE         = 30          # minimum face size in pixels (catch distant faces)

# Eye target positions in the aligned output (fractions of ALIGN_SIZE)
EYE_LEFT_X,  EYE_LEFT_Y  = 0.35, 0.38
EYE_RIGHT_X, EYE_RIGHT_Y = 0.65, 0.38

# Liveness – DISABLED for CCTV (faces are too small/distant for reliable checks)
LIVENESS_ENABLED       = False
BLINK_REQUIRED         = False       # blink detection unusable at CCTV distances
SCLERA_OPEN_THRESHOLD  = 0.025
BLINK_WINDOW           = 60

BACKEND_API = 'https://global-attendance-mqi3k4nbz-shivendras-projects-5911b529.vercel.app/api/attendance/mark'


# ═══════════════════════════════════════════════════════════════════════════════
# FACE ALIGNMENT  – rotates + scales so eyes land at fixed target positions
# ═══════════════════════════════════════════════════════════════════════════════
# ─── CLAHE preprocessing for uneven classroom lighting ───────────────────────
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

def clahe_enhance(img_bgr: np.ndarray) -> np.ndarray:
    """Apply CLAHE on the L channel of LAB for lighting normalisation."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    lab[:, :, 0] = _clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def align_face(img_bgr: np.ndarray,
               left_eye=None, right_eye=None) -> np.ndarray:
    """
    CLAHE-enhance then align using MTCNN eye keypoints.
    Without keypoints falls back to a plain resize.
    """
    img_bgr = clahe_enhance(img_bgr)
    if left_eye is None or right_eye is None:
        return cv2.resize(img_bgr, (ALIGN_SIZE, ALIGN_SIZE))

    lx, ly = float(left_eye[0]),  float(left_eye[1])
    rx, ry = float(right_eye[0]), float(right_eye[1])

    angle        = np.degrees(np.arctan2(ry - ly, rx - lx))
    desired_dist = (EYE_RIGHT_X - EYE_LEFT_X) * ALIGN_SIZE
    current_dist = np.hypot(rx - lx, ry - ly)
    scale        = desired_dist / (current_dist + 1e-9)
    eye_cx, eye_cy = (lx + rx) / 2.0, (ly + ry) / 2.0

    M = cv2.getRotationMatrix2D((eye_cx, eye_cy), angle, scale)
    M[0, 2] += ALIGN_SIZE * 0.5      - eye_cx
    M[1, 2] += ALIGN_SIZE * EYE_LEFT_Y - eye_cy

    return cv2.warpAffine(img_bgr, M, (ALIGN_SIZE, ALIGN_SIZE),
                          flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


# ═══════════════════════════════════════════════════════════════════════════════
# ENSEMBLE EMBEDDING  (ArcFace + Facenet512 concatenated & L2-normalised)
# ═══════════════════════════════════════════════════════════════════════════════
def get_embedding(face_bgr: np.ndarray,
                  left_eye=None, right_eye=None) -> np.ndarray | None:
    """
    Align then extract embeddings from all models in ENSEMBLE_MODELS.
    Returns L2-normalised concatenation, or None on failure.
    """
    aligned  = align_face(face_bgr, left_eye, right_eye)
    face_rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB)

    parts = []
    for model in ENSEMBLE_MODELS:
        try:
            res = DeepFace.represent(img_path=face_rgb, model_name=model,
                                     enforce_detection=False,
                                     detector_backend="skip")
            emb  = np.array(res[0]["embedding"], dtype=np.float32)
            emb /= (np.linalg.norm(emb) + 1e-9)
            parts.append(emb)
        except Exception as e:
            logging.debug(f"Embedding error ({model}): {e}")

    if not parts:
        return None
    combined = np.concatenate(parts)
    combined /= (np.linalg.norm(combined) + 1e-9)
    return combined


# ═══════════════════════════════════════════════════════════════════════════════
# PASSIVE LIVENESS
# ═══════════════════════════════════════════════════════════════════════════════
def _lbp_texture_score(gray64: np.ndarray) -> float:
    lbp = np.zeros_like(gray64, dtype=np.uint8)
    nbrs = [(-1,-1),(-1,0),(-1,1),(0,1),(1,1),(1,0),(1,-1),(0,-1)]
    for r in range(1, 63):
        for c in range(1, 63):
            cv = int(gray64[r, c]); code = 0
            for i, (dr, dc) in enumerate(nbrs):
                if gray64[r+dr, c+dc] >= cv:
                    code |= (1 << i)
            lbp[r, c] = code
    hist, _ = np.histogram(lbp.ravel(), bins=256, range=(0, 256))
    hist = hist.astype(float) / (hist.sum() + 1e-9)
    return float(np.std(hist) * 10_000)


def passive_liveness(face_bgr: np.ndarray) -> tuple:
    """Liveness check – skipped in CCTV mode."""
    if not LIVENESS_ENABLED:
        return True, "cctv-mode"
    if face_bgr is None or face_bgr.size == 0:
        return False, "empty"
    gray64 = cv2.resize(cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY), (64, 64))
    tex = _lbp_texture_score(gray64)
    if tex < 45.0:
        return False, f"low-texture({tex:.0f})"
    b = float(face_bgr[:,:,0].mean()); g = float(face_bgr[:,:,1].mean()); r = float(face_bgr[:,:,2].mean())
    if b - (r + g) / 2.0 > 30.0:
        return False, "screen-blue"
    if float(np.all(face_bgr.astype(np.float32) > 240, axis=2).mean()) > 0.018:
        return False, "glare"
    face_s = cv2.resize(face_bgr, (64, 64))
    ycrcb  = cv2.cvtColor(face_s, cv2.COLOR_BGR2YCrCb)
    Y, Cr, Cb = ycrcb[:,:,0], ycrcb[:,:,1], ycrcb[:,:,2]
    if float(((Y>80)&(Cr>133)&(Cr<173)&(Cb>77)&(Cb<127)).mean()) < 0.06:
        return False, "no-skin"
    return True, "ok"


# ═══════════════════════════════════════════════════════════════════════════════
# ACTIVE LIVENESS – BLINK DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
def _sclera_visible(face_bgr: np.ndarray, eye_kp: tuple) -> bool:
    h, w = face_bgr.shape[:2]
    ex, ey = int(eye_kp[0]), int(eye_kp[1])
    mx, my = max(8, w//7), max(5, h//10)
    roi = face_bgr[max(0,ey-my):min(h,ey+my), max(0,ex-mx):min(w,ex+mx)]
    if roi.size == 0:
        return True
    return float(np.all(roi.astype(np.float32) > 180, axis=2).mean()) > SCLERA_OPEN_THRESHOLD


def eyes_open(face_bgr, le_global, re_global, box) -> bool:
    bx, by = box[0], box[1]
    return (_sclera_visible(face_bgr, (le_global[0]-bx, le_global[1]-by)) or
            _sclera_visible(face_bgr, (re_global[0]-bx, re_global[1]-by)))


def update_blink_state(buf: dict, roll: str, is_open: bool) -> bool:
    if roll not in buf or not isinstance(buf.get(roll), dict):
        buf[roll] = {'frames': 0, 'eye_hist': [], 'blink_done': False}
    s = buf[roll]; hist = s['eye_hist']
    hist.append(is_open)
    if len(hist) > BLINK_WINDOW:
        hist.pop(0)
    if not s['blink_done']:
        for i in range(len(hist)-2):
            if hist[i] and not hist[i+1] and hist[i+2]:
                s['blink_done'] = True; break
    if BLINK_REQUIRED and not s['blink_done']:
        return False
    s['frames'] += 1
    return s['frames'] >= CONFIRM_FRAMES


def reset_blink(buf: dict, roll: str):
    buf.pop(roll, None)


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD GALLERY FROM MONGODB
# ═══════════════════════════════════════════════════════════════════════════════
def crop_face_mtcnn(img_bgr: np.ndarray, detector: MTCNN):
    """Returns (face_bgr, left_eye, right_eye) or (resized_img, None, None)."""
    rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    dets = detector.detect_faces(rgb)  # uses MTCNN_MIN_FACE set at detector creation
    if dets:
        dets.sort(key=lambda d: d['box'][2]*d['box'][3], reverse=True)
        x, y, w, h = dets[0]['box']
        x, y = max(0,x), max(0,y)
        face = img_bgr[y:y+h, x:x+w]
        kp   = dets[0].get('keypoints', {})
        # Translate global keypoints to face-crop coordinates
        le = (kp['left_eye'][0]-x,  kp['left_eye'][1]-y)  if 'left_eye'  in kp else None
        re = (kp['right_eye'][0]-x, kp['right_eye'][1]-y) if 'right_eye' in kp else None
        if face.size > 0:
            return face, le, re
    return cv2.resize(img_bgr, (ALIGN_SIZE, ALIGN_SIZE)), None, None


def build_gallery_from_mongo(detector: MTCNN, exam_cell_id) -> dict:
    """Return {roll_number: mean_ensemble_embedding} from student photos."""
    gallery: dict[str, list] = {}
    if not MONGO_URI:
        logging.error("MONGO_URI not set.")
        return {}
    client = None
    try:
        client = MongoClient(MONGO_URI)
        coll   = client[MONGO_DB_NAME][MONGO_USERS_COLLECTION]
        cursor = coll.find(
            {"role": "student", "createdBy": exam_cell_id},
            {"rollNumber": 1, "photoData": 1, "photosData": 1}
        )
        for doc in cursor:
            roll = doc.get("rollNumber")
            if not roll:
                continue
            raw_bufs = []
            if doc.get("photoData"):
                raw_bufs.append(bytes(doc["photoData"]))
            for p in doc.get("photosData", []):
                if p.get("data"):
                    raw_bufs.append(bytes(p["data"]))

            embs = []
            for raw in raw_bufs:
                arr = np.frombuffer(raw, dtype=np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is None:
                    continue
                face, le, re = crop_face_mtcnn(img, detector)
                emb = get_embedding(face, le, re)
                if emb is not None:
                    embs.append(emb)

            if embs:
                gallery[str(roll)] = np.mean(np.stack(embs), axis=0)
                logging.info(f"  {roll}: {len(embs)} embeddings extracted")
            else:
                logging.warning(f"  {roll}: no valid embeddings – skipped")

    except Exception as e:
        logging.error(f"MongoDB error: {e}")
    finally:
        if client:
            client.close()
    logging.info(f"Gallery built: {len(gallery)} students")
    return gallery


# ═══════════════════════════════════════════════════════════════════════════════
# RECOGNITION
# ═══════════════════════════════════════════════════════════════════════════════
def recognize(face_bgr: np.ndarray, gallery: dict,
              left_eye=None, right_eye=None) -> tuple:
    """Returns (best_roll, similarity) or (None, score) if below threshold."""
    emb = get_embedding(face_bgr, left_eye, right_eye)
    if emb is None:
        return None, 0.0
    best_roll, best_sim = None, -1.0
    dim_warned = False
    for roll, gvec in gallery.items():
        if emb.shape[0] != gvec.shape[0]:
            if not dim_warned:
                logging.warning(
                    f"Gallery dimension mismatch: live={emb.shape[0]}, "
                    f"gallery={gvec.shape[0]}. Rebuild gallery (old gallery uses "
                    f"single-model embeddings; new code uses ensemble).")
                dim_warned = True
            continue  # skip stale vectors rather than crash
        sim = float(1.0 - cosine_distance(emb, gvec))
        if sim > best_sim:
            best_sim, best_roll = sim, roll
    return (best_roll, best_sim) if best_sim >= SIM_THRESHOLD else (None, best_sim)


# ═══════════════════════════════════════════════════════════════════════════════
# ATTENDANCE CSV + API
# ═══════════════════════════════════════════════════════════════════════════════
def init_csv(date_today: str) -> str:
    path = f"attendance_{date_today}.csv"
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            csv.writer(f).writerow(
                ["RollNumber", "Date", "Time", "Status", "Period", "Similarity"])
    return path


def mark_attendance(roll: str, sim: float, date_today: str,
                    att_file: str, att_set: set, period: int):
    if roll in att_set:
        return
    att_set.add(roll)
    ts = datetime.now().strftime("%H:%M:%S")
    with open(att_file, "a", newline="") as f:
        csv.writer(f).writerow(
            [roll, date_today, ts, "present", f"Period {period}", f"{sim:.3f}"])
    logging.info(f"[PRESENT ] {roll:<20} Sim={sim:.3f}  P{period}")
    try:
        r = requests.post(BACKEND_API, json={
            'rollNumber': roll, 'date': date_today,
            'time': ts, 'status': 'present', 'classPeriod': period
        }, timeout=10)
        logging.info("API ✔" if r.status_code == 200 else f"API NACK: {r.text}")
    except Exception as e:
        logging.error(f"API error: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# DB / MANIFEST HELPERS  (importable by streamlit_app.py)
# ═══════════════════════════════════════════════════════════════════════════════
def get_db_students(coll, exam_cell_id) -> set:
    cursor = coll.find(
        {"role": "student", "createdBy": exam_cell_id}, {"rollNumber": 1})
    return {doc["rollNumber"] for doc in cursor if doc.get("rollNumber")}


def load_manifest(p: Path) -> set:
    return pickle.load(open(p, 'rb')) if p.exists() else set()


def save_manifest(p: Path, s: set):
    pickle.dump(s, open(p, 'wb'))



# ═══════════════════════════════════════════════════════════════════════════════
def process_frame(frame, gallery: dict, detector: MTCNN,
                  att_file, att_set, date_today, period, confirm_buf):
    small = cv2.resize(frame, (0, 0), fx=FRAME_SCALE_FACTOR, fy=FRAME_SCALE_FACTOR)
    rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    s     = FRAME_SCALE_FACTOR

    detections = detector.detect_faces(rgb)
    if not detections:
        return frame

    for det in detections:
        if det.get('confidence', 0) < MTCNN_DETECT_CONF:
            continue
        x, y, w, h = det['box']
        # Skip faces smaller than MTCNN_MIN_FACE (too tiny / too far to recognise)
        if w < MTCNN_MIN_FACE or h < MTCNN_MIN_FACE:
            continue
        x, y = max(0, x), max(0, y)
        L, T = int(x/s), int(y/s)
        R, B = int((x+w)/s), int((y+h)/s)

        # Passive liveness on full-res crop
        roi_full = frame[max(0,T):B, max(0,L):R]
        live_ok, reason = passive_liveness(roi_full)
        if not live_ok:
            cv2.rectangle(frame, (L,T), (R,B), (0,0,220), 2)
            cv2.putText(frame, f"SPOOF: {reason}",
                        (L, T-8), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0,0,220), 2)
            continue

        face_bgr = small[y:y+h, x:x+w]
        if face_bgr.size == 0:
            continue

        # Get MTCNN eye keypoints (in small-frame coordinates)
        kp = det.get('keypoints', {})
        le_g = kp.get('left_eye')    # global in small frame
        re_g = kp.get('right_eye')

        # For blink: translate to face-crop coords
        le_face = (le_g[0]-x, le_g[1]-y) if le_g else None
        re_face = (re_g[0]-x, re_g[1]-y) if re_g else None
        is_open = (_sclera_visible(face_bgr, le_face) if le_face else True or
                   _sclera_visible(face_bgr, re_face) if re_face else True)

        # Ensemble recognition with aligned face (pass raw face + small-frame keypoints)
        roll, sim = recognize(face_bgr, gallery, le_face, re_face)

        if roll is None:
            cv2.rectangle(frame, (L,T), (R,B), (0,80,200), 2)
            cv2.putText(frame, f"UNKNOWN ({sim:.2f})",
                        (L, T-8), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0,80,200), 2)
            continue

        ready = update_blink_state(confirm_buf, roll, is_open)
        state       = confirm_buf.get(roll, {})
        blink_done  = state.get('blink_done', False) if isinstance(state, dict) else False
        frames_done = state.get('frames', 0)         if isinstance(state, dict) else 0

        if BLINK_REQUIRED and not blink_done:
            color = (0, 200, 255)
            label = f"{roll}  Sim={sim:.2f}  BLINK PLEASE"
        else:
            color = (0, 220, 0)
            label = f"{roll}  Sim={sim:.2f}  ({frames_done}/{CONFIRM_FRAMES})"

        if ready:
            mark_attendance(roll, sim, date_today, att_file, att_set, period)
            reset_blink(confirm_buf, roll)

        cv2.rectangle(frame, (L,T), (R,B), color, 2)
        cv2.putText(frame, label, (L, T-8), cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 2)

    return frame


# ═══════════════════════════════════════════════════════════════════════════════
# DB DIFF HELPERS
# ═══════════════════════════════════════════════════════════════════════════════
def get_db_students(coll, exam_cell_id) -> set:
    cursor = coll.find(
        {"role": "student", "createdBy": exam_cell_id}, {"rollNumber": 1})
    return {doc["rollNumber"] for doc in cursor if doc.get("rollNumber")}


def load_manifest(p: Path) -> set:
    return pickle.load(open(p, 'rb')) if p.exists() else set()


def save_manifest(p: Path, s: set):
    pickle.dump(s, open(p, 'wb'))


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    bar = "=" * 66
    logging.info(bar)
    logging.info(f"  ArcFace+Facenet512 Ensemble Attendance  |  Aligned Faces")
    logging.info(bar)

    print("\n--- Exam Cell Login ---")
    exam_email    = input("Enter Exam Cell Email: ").strip()
    exam_password = getpass.getpass("Enter Password: ")

    if not MONGO_URI:
        logging.error("MONGO_URI not set.")
        return

    client = MongoClient(MONGO_URI)
    coll   = client[MONGO_DB_NAME][MONGO_USERS_COLLECTION]
    user   = coll.find_one({
        "email": exam_email,
        "role": {"$in": ["exam cell", "examcell", "exam_cell"]}
    })
    if not user:
        logging.error("Auth failed: account not found.")
        return

    stored_pw = user['password']
    if isinstance(stored_pw, str):
        stored_pw = stored_pw.encode('utf-8')
    if not bcrypt.checkpw(exam_password.encode('utf-8'), stored_pw):
        logging.error("Auth failed: wrong password.")
        return

    exam_cell_id = user['_id']
    logging.info(f"Authenticated as {user.get('name')} ({exam_email}).")

    safe_email    = exam_email.replace('@', '_at_').replace('.', '_')
    gallery_path  = Path(__file__).parent / f"gallery_{safe_email}.pkl"
    manifest_path = Path(__file__).parent / f"manifest_{safe_email}.pkl"

    logging.info(f"  Models        : {' + '.join(ENSEMBLE_MODELS)}")
    logging.info(f"  Sim threshold : >= {SIM_THRESHOLD}")
    logging.info(f"  Confirm frames: {CONFIRM_FRAMES}")
    logging.info(bar)

    detector = MTCNN()
    logging.info(f"MTCNN ready (conf>={MTCNN_DETECT_CONF}, min_face filter={MTCNN_MIN_FACE}px).")

    db_students    = get_db_students(coll, exam_cell_id)
    saved_students = load_manifest(manifest_path)

    if not db_students:
        logging.error("No students found in DB. Exiting.")
        return

    needs_rebuild = (not gallery_path.exists()) or (db_students != saved_students)

    if needs_rebuild:
        logging.info(f"Building gallery for {len(db_students)} students...")
        gallery = build_gallery_from_mongo(detector, exam_cell_id)
        if not gallery:
            logging.error("Gallery empty – check student photos in DB. Exiting.")
            return
        pickle.dump(gallery, open(gallery_path, 'wb'))
        save_manifest(manifest_path, db_students)
        logging.info(f"Gallery saved: {len(gallery)} students.")
    else:
        logging.info(f"Loading saved gallery ({len(db_students)} students)...")
        gallery = pickle.load(open(gallery_path, 'rb'))
        logging.info(f"Gallery ready: {sorted(gallery.keys())}")

    logging.info("Live attendance started. Press 'q' to quit.")
    date_today   = datetime.now().strftime("%Y-%m-%d")
    att_file     = init_csv(date_today)
    class_period = 1

    try:
        while class_period <= 6:
            logging.info(f"\n-- Period {class_period} --")
            att_set, confirm_buf = set(), {}

            cap = cv2.VideoCapture(CAMERA_URL)
            if not cap.isOpened():
                logging.error("Camera unavailable – retrying in 30 s")
                time.sleep(30)
                continue

            start = time.time()
            logging.info("Running for 60 seconds...")

            try:
                cv2.namedWindow("Attendance System", cv2.WINDOW_NORMAL)
                cv2.resizeWindow("Attendance System", 900, 650)
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    frame = process_frame(
                        frame, gallery, detector,
                        att_file, att_set, date_today, class_period, confirm_buf
                    )
                    cv2.putText(
                        frame,
                        f"P{class_period} | Present:{len(att_set)} | {date_today} | {'+'.join(ENSEMBLE_MODELS)}",
                        (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255,255,255), 2
                    )
                    cv2.imshow("Attendance System", frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        logging.info("Quit by user.")
                        return
                    if time.time() - start > 60:
                        break
            except KeyboardInterrupt:
                logging.info("Interrupted.")
                return
            finally:
                cap.release()
                cv2.destroyAllWindows()

            logging.info(f"Period {class_period} done – {len(att_set)} present.")
            time.sleep(10)
            class_period += 1

    except Exception as e:
        logging.error(f"Main error: {e}", exc_info=True)
    finally:
        logging.info("System stopped.")


if __name__ == "__main__":
    main()
