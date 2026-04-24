"""
Multi-Camera Attendance System – Streamlit Dashboard
======================================================
Run with:  streamlit run streamlit_app.py

Each camera runs in its own background thread.
Frames are placed in a shared queue; Streamlit reads them for display.
"""

import streamlit as st
import cv2
import numpy as np
import threading
import time
import pickle
import os
import csv
import bcrypt
import requests
import tempfile
from pathlib import Path
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
from streamlit_webrtc import webrtc_streamer, VideoProcessorBase, RTCConfiguration, WebRtcMode

# ── Core recognition from attendance.py ──────────────────────────────────────
from attendance import (
    get_embedding, recognize, passive_liveness,
    update_blink_state, reset_blink, mark_attendance,
    align_face, clahe_enhance, MTCNN,
    MTCNN_DETECT_CONF, MTCNN_MIN_FACE, LIVENESS_ENABLED,
    BLINK_REQUIRED, SIM_THRESHOLD, ENSEMBLE_MODELS,
    BACKEND_API, build_gallery_from_mongo, get_db_students,
    load_manifest, save_manifest,
)

# ── Environment ───────────────────────────────────────────────────────────────
# Inject Streamlit secrets into environment variables for attendance.py
if "MONGO_URI" in st.secrets:
    for key in ["MONGO_URI", "MONGO_DB_NAME", "MONGO_USERS_COLLECTION"]:
        if key in st.secrets:
            os.environ[key] = st.secrets[key]

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)

MONGO_URI              = os.getenv("MONGO_URI")
MONGO_DB_NAME          = os.getenv("MONGO_DB_NAME", "test")
MONGO_USERS_COLLECTION = os.getenv("MONGO_USERS_COLLECTION", "users")

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Multi-Camera Attendance",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
body { background: #0f0c29; color: white; }
.block-container { padding-top: 1rem; }
.cam-title { font-size: 14px; font-weight: 700; color: #00f5d4; margin-bottom: 4px; }
.present-badge { background: #28a745; color: white; border-radius: 8px; padding: 2px 10px; font-size: 12px; }
.absent-badge  { background: #dc3545; color: white; border-radius: 8px; padding: 2px 10px; font-size: 12px; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# Session state initialisation
# ─────────────────────────────────────────────────────────────────────────────
def ss(key, default):
    if key not in st.session_state:
        st.session_state[key] = default

ss("authenticated",    False)
ss("exam_cell_id",     None)
ss("gallery",          None)
ss("cameras",          {})        # {cam_id: {"source": str|int, "name": str}}
ss("cam_frames",       {})        # {cam_id: np.ndarray}  latest annotated frame
ss("cam_threads",      {})        # {cam_id: Thread}
ss("cam_stop",         {})        # {cam_id: threading.Event}
ss("attendance_log",   {})        # {roll: {"name":, "time":, "sim":, "cam":}}
ss("detector",         None)
ss("date_today",       datetime.now().strftime("%Y-%m-%d"))
ss("schedule",         [])        # [{"name":, "period":, "duration":, "break":, "source":}]
ss("sched_active",     False)
ss("sched_idx",        0)         # current class index
ss("sched_mode",       "class")   # "class" or "break"
ss("sched_start_ts",   0)         # unix timestamp when current mode started

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA WORKER THREAD
# ─────────────────────────────────────────────────────────────────────────────
def camera_worker(cam_id: str, source, gallery: dict,
                  frame_store: dict, stop_event: threading.Event,
                  att_log: dict, date_today: str, period: int, duration: int):
    """Runs in a background thread. Reads frames, annotates, stores latest."""
    start_time = time.time()
    duration_secs = duration * 60 if duration > 0 else None
    detector = MTCNN()
    confirm_buf = {}
    att_set     = set(att_log.keys())
    att_file    = f"attendance_{date_today}.csv"

    # Ensure CSV header
    if not os.path.exists(att_file):
        with open(att_file, "w", newline="") as f:
            csv.writer(f).writerow(
                ["RollNumber","Date","Time","Status","Period","Similarity","Camera"])

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        frame_store[cam_id] = _text_frame(f"Camera {cam_id}: FAILED TO OPEN")
        return

    while not stop_event.is_set():
        if duration_secs:
            elapsed = time.time() - start_time
            if elapsed >= duration_secs:
                logging.info(f"Camera {cam_id} reached duration of {duration} min. Stopping.")
                break
            remaining = int(duration_secs - elapsed)
            rem_str = f"Time Rem: {remaining // 60:02d}:{remaining % 60:02d}"
        else:
            rem_str = "Duration: Unlimited"

        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue

        small = cv2.resize(frame, (0, 0), fx=0.8, fy=0.8)
        rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        s     = 0.8

        try:
            dets = detector.detect_faces(rgb)
        except Exception:
            dets = []

        for det in dets:
            if det.get("confidence", 0) < MTCNN_DETECT_CONF:
                continue
            x, y, w, h = det["box"]
            x, y = max(0, x), max(0, y)
            if w < MTCNN_MIN_FACE or h < MTCNN_MIN_FACE:
                continue
            L, T = int(x/s), int(y/s)
            R, B = int((x+w)/s), int((y+h)/s)

            face_bgr = small[y:y+h, x:x+w]
            if face_bgr.size == 0:
                continue

            kp     = det.get("keypoints", {})
            le     = (kp["left_eye"][0]-x,  kp["left_eye"][1]-y)  if "left_eye"  in kp else None
            re     = (kp["right_eye"][0]-x, kp["right_eye"][1]-y) if "right_eye" in kp else None

            roll, sim = recognize(face_bgr, gallery, le, re)

            if roll is None:
                cv2.rectangle(frame, (L,T), (R,B), (0,80,200), 2)
                cv2.putText(frame, f"Unknown ({sim:.2f})",
                            (L, T-6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,80,200), 1)
                continue

            is_open = True
            ready   = update_blink_state(confirm_buf, roll, is_open)
            color   = (0, 220, 0) if ready else (0, 200, 255)
            label   = f"{roll}  {sim:.2f}"

            if ready and roll not in att_set:
                att_set.add(roll)
                ts = datetime.now().strftime("%H:%M:%S")
                with open(att_file, "a", newline="") as f:
                    csv.writer(f).writerow(
                        [roll, date_today, ts, "present", f"P{period}", f"{sim:.3f}", cam_id])
                att_log[roll] = {"time": ts, "sim": sim, "cam": cam_id}
                reset_blink(confirm_buf, roll)
                # Push to backend API
                try:
                    requests.post(BACKEND_API, json={
                        "rollNumber": roll, "date": date_today,
                        "time": ts, "status": "present", "classPeriod": period
                    }, timeout=5)
                except Exception:
                    pass

            cv2.rectangle(frame, (L,T), (R,B), color, 2)
            cv2.putText(frame, label, (L, T-6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1)

        # Overlay cam label and time
        cv2.putText(frame, f"CAM: {cam_id} | {rem_str}", (8, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,0), 2)
        frame_store[cam_id] = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    cap.release()


# ── WebRTC Processor for Browser Webcam ─────────────────────────────────────────
RTC_CONFIG = RTCConfiguration({"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]})

class FaceRecognitionTransformer(VideoProcessorBase):
    def __init__(self, gallery, att_log, date_today):
        self.gallery = gallery
        self.att_log = att_log
        self.date_today = date_today
        self.detector = MTCNN()
        self.confirm_buf = {}
        self.period = 1 # Default

    def recv(self, frame):
        img = frame.to_ndarray(format="bgr24")
        
        # Process the frame using the core recognition logic
        annotated = process_frame(
            img, self.gallery, self.detector,
            f"attendance_{self.date_today}.csv", 
            set(self.att_log.keys()), 
            self.date_today, self.period, self.confirm_buf
        )
        
        from av import VideoFrame
        return VideoFrame.from_ndarray(annotated, format="bgr24")

def _text_frame(msg: str) -> np.ndarray:
    img = np.zeros((240, 480, 3), dtype=np.uint8)
    cv2.putText(img, msg, (10, 120),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,200,255), 2)
    return img


# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR – Login & camera management
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🎓 Attendance System")
    st.markdown("---")

    # ── AUTH ──────────────────────────────────────────────────────────────────
    if not st.session_state.authenticated:
        st.subheader("🔐 Login")
        email = st.text_input("Exam Cell Email")
        pwd   = st.text_input("Password", type="password")
        if st.button("Login", use_container_width=True):
            if not MONGO_URI:
                st.error("MONGO_URI not set in .env")
            else:
                try:
                    client = MongoClient(MONGO_URI)
                    coll   = client[MONGO_DB_NAME][MONGO_USERS_COLLECTION]
                    user   = coll.find_one({
                        "email": email,
                        "role": {"$in": ["exam cell","examcell","exam_cell"]}
                    })
                    if not user:
                        st.error("Account not found.")
                    else:
                        sp = user["password"]
                        if isinstance(sp, str): sp = sp.encode()
                        if bcrypt.checkpw(pwd.encode(), sp):
                            st.session_state.authenticated = True
                            st.session_state.exam_cell_id  = user["_id"]
                            st.success(f"Welcome, {user.get('name','')}")
                            st.rerun()
                        else:
                            st.error("Wrong password.")
                except Exception as e:
                    st.error(f"DB error: {e}")
        st.stop()

    st.success("✅ Logged in")
    if st.button("Logout"):
        for k in ["authenticated","exam_cell_id","gallery","cameras",
                  "cam_frames","cam_threads","cam_stop","attendance_log"]:
            st.session_state[k] = {} if k in ["cameras","cam_frames","cam_threads","cam_stop","attendance_log"] else None if k not in ["authenticated"] else False
        st.rerun()

    st.markdown("---")

    # ── GALLERY ───────────────────────────────────────────────────────────────
    st.subheader("📦 Face Gallery")
    safe_email    = str(st.session_state.exam_cell_id).replace(" ","_")
    gallery_path  = Path(__file__).parent / f"gallery_{safe_email}.pkl"
    manifest_path = Path(__file__).parent / f"manifest_{safe_email}.pkl"

    if gallery_path.exists():
        st.info(f"Gallery found: {gallery_path.name}")
    else:
        st.warning("No gallery – build one first.")

    col1, col2 = st.columns(2)
    if col1.button("Build Gallery"):
        with st.spinner("Building gallery from DB…"):
            try:
                det  = MTCNN()
                gall = build_gallery_from_mongo(det, st.session_state.exam_cell_id)
                if gall:
                    pickle.dump(gall, open(gallery_path, "wb"))
                    db_s = get_db_students(
                        MongoClient(MONGO_URI)[MONGO_DB_NAME][MONGO_USERS_COLLECTION],
                        st.session_state.exam_cell_id)
                    save_manifest(manifest_path, db_s)
                    st.session_state.gallery = gall
                    st.success(f"Gallery ready: {len(gall)} students")
                else:
                    st.error("No embeddings – check student photos in DB.")
            except Exception as e:
                st.error(f"Error: {e}")

    if col2.button("Load Gallery"):
        if gallery_path.exists():
            st.session_state.gallery = pickle.load(open(gallery_path, "rb"))
            st.success(f"Loaded: {len(st.session_state.gallery)} students")
        else:
            st.error("No gallery file found.")

    st.markdown("---")

    # ── CAMERA MANAGEMENT ─────────────────────────────────────────────────────
    st.subheader("📷 Cameras")
    with st.expander("➕ Add Camera"):
        cam_name   = st.text_input("Camera Name", placeholder="Classroom A")
        col_p, col_d = st.columns(2)
        period_num = col_p.number_input("Class Period", 1, 6, 1)
        duration   = col_d.number_input("Duration (min)", 0, 480, 60, help="0 = Unlimited")

        src_type = st.radio("Source Type",
                            ["🎥 Local Webcam", "🌐 Browser Webcam (Cloud)", "📡 RTSP", "📁 Video File"],
                            horizontal=True)

        final_source = None
        is_webrtc = False

        if src_type == "🎥 Local Webcam":
            st.info("Best for local deployment (uses PC camera)")
            @st.cache_data(show_spinner=False)
            def scan_webcams():
                available = []
                for i in range(5):
                    cap = cv2.VideoCapture(i)
                    if cap.isOpened():
                        available.append(i)
                        cap.release()
                return available or [0]
            available_cams = scan_webcams()
            final_source = st.selectbox("Select Webcam", available_cams)

        elif src_type == "🌐 Browser Webcam (Cloud)":
            st.success("Best for Cloud (uses browser camera)")
            is_webrtc = True
            final_source = "webrtc"

        elif src_type == "📡 RTSP":
            rtsp_url = st.text_input("RTSP / HTTP URL", placeholder="rtsp://...")
            final_source = rtsp_url.strip()

        else:  # Video File
            uploaded_file = st.file_uploader("Upload Video", type=['mp4', 'avi', 'mov'])
            if uploaded_file:
                tfile = tempfile.NamedTemporaryFile(delete=False)
                tfile.write(uploaded_file.read())
                final_source = tfile.name
                st.write(f"Loaded: {uploaded_file.name}")
            else:
                file_path = st.text_input("OR Local Path", placeholder="C:/videos/...")
                final_source = file_path.strip()

        if st.button("Add Camera", width='stretch'):
            if not final_source and final_source != 0:
                st.error("Please provide a source.")
            else:
                cam_id = f"cam_{len(st.session_state.cameras)+1}"
                st.session_state.cameras[cam_id] = {
                    "source": final_source,
                    "name":   cam_name or cam_id,
                    "period": period_num,
                    "duration": duration,
                    "is_webrtc": is_webrtc
                }
                st.success(f"✅ Added **{cam_name or cam_id}**")
                st.rerun()

    # ── SCHEDULER ─────────────────────────────────────────────────────────────
    st.markdown("---")
    st.subheader("📅 Class Scheduler")
    
    if not st.session_state.cameras:
        st.info("Add at least one camera source first.")
    else:
        with st.expander("📝 Build Schedule"):
            sel_cam = st.selectbox("Select Class/Cam", 
                                   options=list(st.session_state.cameras.keys()),
                                   format_func=lambda k: st.session_state.cameras[k]["name"])
            brk = st.number_input("Break after (min)", 0, 60, 10)
            if st.button("➕ Add to Schedule"):
                cam_info = st.session_state.cameras[sel_cam]
                st.session_state.schedule.append({
                    "cam_id": sel_cam,
                    "name": cam_info["name"],
                    "period": cam_info["period"],
                    "duration": cam_info["duration"],
                    "break": brk,
                    "source": cam_info["source"]
                })
                st.success("Added to schedule")

        if st.session_state.schedule:
            for i, item in enumerate(st.session_state.schedule):
                c1, c2 = st.columns([4,1])
                c1.write(f"{i+1}. **{item['name']}** (P{item['period']}, {item['duration']}m + {item['break']}m)")
                if c2.button("❌", key=f"del_sch_{i}"):
                    st.session_state.schedule.pop(i)
                    st.rerun()

            if not st.session_state.sched_active:
                if st.button("🚀 Start Auto-Schedule", type="primary", width='stretch'):
                    st.session_state.sched_active = True
                    st.session_state.sched_idx = 0
                    st.session_state.sched_mode = "class"
                    st.session_state.sched_start_ts = time.time()
                    st.rerun()
            else:
                if st.button("🛑 Stop Scheduler", type="primary", width='stretch'):
                    st.session_state.sched_active = False
                    # Also stop active camera
                    for cam_id in st.session_state.cam_stop:
                        st.session_state.cam_stop[cam_id].set()
                    st.rerun()

    # List cameras with start/stop
    for cam_id, info in list(st.session_state.cameras.items()):
        running = cam_id in st.session_state.cam_threads and \
                  st.session_state.cam_threads[cam_id].is_alive()
        status_icon = "🟢" if running else "🔴"
        c1, c2, c3 = st.columns([3,1,1])
        c1.markdown(f"{status_icon} **{info['name']}** (P{info['period']}, {info['duration']}m)")

        if not running:
            if c2.button("▶", key=f"start_{cam_id}"):
                if st.session_state.gallery is None:
                    st.error("Load gallery first!")
                else:
                    stop_ev = threading.Event()
                    st.session_state.cam_stop[cam_id]   = stop_ev
                    st.session_state.cam_frames[cam_id]  = _text_frame("Starting…")
                    t = threading.Thread(
                        target=camera_worker,
                        args=(cam_id, info["source"],
                              st.session_state.gallery,
                              st.session_state.cam_frames,
                              stop_ev,
                              st.session_state.attendance_log,
                              st.session_state.date_today,
                              info["period"],
                              info["duration"]),
                        daemon=True)
                    t.start()
                    st.session_state.cam_threads[cam_id] = t
                    st.rerun()
        else:
            if c2.button("⏹", key=f"stop_{cam_id}"):
                st.session_state.cam_stop[cam_id].set()
                st.rerun()

        if c3.button("🗑", key=f"del_{cam_id}"):
            if cam_id in st.session_state.cam_stop:
                st.session_state.cam_stop[cam_id].set()
            del st.session_state.cameras[cam_id]
            st.rerun()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN AREA
# ─────────────────────────────────────────────────────────────────────────────
st.title("🎓 Multi-Camera Attendance Dashboard")

# ── SCHEDULER LOGIC ──────────────────────────────────────────────────────────
if st.session_state.sched_active:
    idx = st.session_state.sched_idx
    if idx < len(st.session_state.schedule):
        item = st.session_state.schedule[idx]
        cam_id = item["cam_id"]
        elapsed = time.time() - st.session_state.sched_start_ts
        
        if st.session_state.sched_mode == "class":
            # Start camera if not running
            if cam_id not in st.session_state.cam_threads or not st.session_state.cam_threads[cam_id].is_alive():
                stop_ev = threading.Event()
                st.session_state.cam_stop[cam_id] = stop_ev
                t = threading.Thread(
                    target=camera_worker,
                    args=(cam_id, item["source"], st.session_state.gallery, 
                          st.session_state.cam_frames, stop_ev, 
                          st.session_state.attendance_log, st.session_state.date_today, 
                          item["period"], item["duration"]),
                    daemon=True)
                t.start()
                st.session_state.cam_threads[cam_id] = t
            
            if elapsed >= item["duration"] * 60:
                # Class over -> Start Break
                st.session_state.cam_stop[cam_id].set()
                st.session_state.sched_mode = "break"
                st.session_state.sched_start_ts = time.time()
                st.rerun()
                
        elif st.session_state.sched_mode == "break":
            if elapsed >= item["break"] * 60:
                # Break over -> Next Class
                st.session_state.sched_idx += 1
                st.session_state.sched_mode = "class"
                st.session_state.sched_start_ts = time.time()
                st.rerun()
    else:
        st.session_state.sched_active = False
        st.balloons()
        st.success("All scheduled classes completed!")

# ── DASHBOARD UI ─────────────────────────────────────────────────────────────
if st.session_state.sched_active:
    item = st.session_state.schedule[st.session_state.sched_idx]
    elapsed = int(time.time() - st.session_state.sched_start_ts)
    if st.session_state.sched_mode == "class":
        rem = max(0, item["duration"] * 60 - elapsed)
        st.warning(f"🚀 **ACTIVE SCHEDULE:** Class **{item['name']}** in progress. Ends in {rem//60:02d}:{rem%60:02d}")
    else:
        rem = max(0, item["break"] * 60 - elapsed)
        st.info(f"☕ **BREAK TIME:** Next class: **{st.session_state.schedule[st.session_state.sched_idx+1]['name'] if st.session_state.sched_idx+1 < len(st.session_state.schedule) else 'None'}**. Resuming in {rem//60:02d}:{rem%60:02d}")

tab_live, tab_attend, tab_settings = st.tabs(
    ["📹 Live Feeds", "📋 Attendance Board", "⚙️ Settings"])

# ── TAB 1: Live Feeds ─────────────────────────────────────────────────────────
with tab_live:
    if not st.session_state.cameras:
        st.info("Add cameras from the sidebar to begin.")
    else:
        auto_refresh = st.checkbox("Auto-refresh every 2 s", value=True)
        cam_ids = list(st.session_state.cameras.keys())
        cols    = st.columns(min(len(cam_ids), 3))

        placeholders = {}
        for i, cam_id in enumerate(cam_ids):
            with cols[i % 3]:
                info = st.session_state.cameras[cam_id]
                st.markdown(f'<div class="cam-title">📷 {info["name"]} — Period {info["period"]}</div>',
                            unsafe_allow_html=True)
                placeholders[cam_id] = st.empty()

        # Display current frames
        for cam_id, ph in placeholders.items():
            info = st.session_state.cameras[cam_id]
            
            if info.get("is_webrtc"):
                with ph:
                    webrtc_streamer(
                        key=cam_id,
                        mode=WebRtcMode.SENDRECV,
                        rtc_configuration=RTC_CONFIG,
                        video_processor_factory=lambda: FaceRecognitionTransformer(
                            st.session_state.gallery,
                            st.session_state.attendance_log,
                            st.session_state.date_today
                        ),
                        async_processing=True,
                    )
            else:
                frame = st.session_state.cam_frames.get(cam_id)
                if frame is not None:
                    ph.image(frame, width='stretch')
                else:
                    ph.image(_text_frame("Not started"), width='stretch')

        if auto_refresh:
            time.sleep(2)
            st.rerun()

# ── TAB 2: Attendance Board ────────────────────────────────────────────────────
with tab_attend:
    st.subheader(f"📋 Today's Attendance — {st.session_state.date_today}")
    log = st.session_state.attendance_log

    if not log:
        st.info("No attendance marked yet.")
    else:
        rows = []
        for roll, data in sorted(log.items()):
            rows.append({
                "Roll Number": roll,
                "Time":        data.get("time","—"),
                "Similarity":  f"{data.get('sim',0):.3f}",
                "Camera":      data.get("cam","—"),
                "Status":      "✅ Present"
            })
        st.dataframe(rows, width='stretch')
        st.metric("Total Present", len(log))

    if st.button("🔄 Refresh Board"):
        st.rerun()

    # Download CSV
    if log:
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Roll Number", "Time", "Similarity", "Camera", "Status"])
        for roll, data in sorted(log.items()):
            writer.writerow([
                roll, 
                data.get("time", ""), 
                f"{data.get('sim', 0):.3f}", 
                data.get("cam", ""), 
                "present"
            ])
        csv_data = output.getvalue()
        
        st.download_button(
            label="⬇ Download Today's CSV",
            data=csv_data,
            file_name=f"attendance_{st.session_state.date_today}.csv",
            mime="text/csv",
            width='stretch'
        )

# ── TAB 3: Settings ───────────────────────────────────────────────────────────
with tab_settings:
    st.subheader("⚙️ Recognition Settings")
    st.info("Edit `attendance.py` config constants to change these permanently.")
    st.markdown(f"""
    | Setting | Value |
    |---|---|
    | Models | `{' + '.join(ENSEMBLE_MODELS)}` |
    | Similarity Threshold | `{SIM_THRESHOLD}` |
    | MTCNN Min Face | `{MTCNN_MIN_FACE} px` |
    | MTCNN Confidence | `{MTCNN_DETECT_CONF}` |
    | Liveness Enabled | `{LIVENESS_ENABLED}` |
    | Blink Required | `{BLINK_REQUIRED}` |
    | Backend API | `{BACKEND_API}` |
    """)

    st.subheader("📷 Camera Sources Guide")
    st.markdown("""
    | Source | Example |
    |---|---|
    | USB Camera index | `0`, `1`, `2` … |
    | IP Camera (RTSP) | `rtsp://user:pass@192.168.1.100:554/stream` |
    | HTTP MJPEG stream | `http://192.168.1.100:8080/video` |
    | Video file (test) | `C:/path/to/video.mp4` |
    
    > **Tip:** Connect CCTV cameras via NVR/DVR to the server, then use the RTSP URL per camera channel.
    """)
