import React, { useEffect, useState, useRef } from 'react';
// axios is used to make http requests to the backend server
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import './Attendance.css';

const API_URL = process.env.REACT_APP_API_URL;

const Attendance = () => {
  // State variables for attendance data, students, messages, selected date and class period in this setAttendance is used to update the attendance state variable it is a function to update the state variable
  const [attendance, setAttendance] = useState([]);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState('');
  // useState for local date
  const today = new Date();
  const localDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [selectedClassPeriod, setSelectedClassPeriod] = useState(1);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedRollNumber, setSelectedRollNumber] = useState('');
  const [studentChartData, setStudentChartData] = useState([]);
  const [selectedStartDate, setSelectedStartDate] = useState(localDate);
  const [selectedEndDate, setSelectedEndDate] = useState(localDate);
  const [selectedFilterPeriod, setSelectedFilterPeriod] = useState('');
  const [searchMode, setSearchMode] = useState('range'); // 'range' for summary, 'single' for whole student attendance
  const [selectedFilterSubject, setSelectedFilterSubject] = useState('');
  const [facultyList, setFacultyList] = useState([]);
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', password: '', class: '', year: 1, rollNumber: '', photo: null });
  const [showAddFacultyForm, setShowAddFacultyForm] = useState(false);
  const [newFaculty, setNewFaculty] = useState({ name: '', email: '', password: '', subject: '', photo: null });
  const [showEditStudentForm, setShowEditStudentForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null); // 'addStudent', 'editStudent', 'addFaculty'
  const [captureProgress, setCaptureProgress] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  // Class schedule state
  const [schedules, setSchedules] = useState([]);
  const [showAssignClass, setShowAssignClass] = useState(false);
  const [assignForm, setAssignForm] = useState({ branch: '', year: '', date: localDate, classPeriod: '1', subject: '' });
  const [scheduleMsg, setScheduleMsg] = useState('');

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const params = {};
        if (role === 'student') {
          // For students, fetch all their attendance without date filter
        } else {
          if (searchMode === 'range') {
            if (selectedStartDate) params.startDate = selectedStartDate;
            if (selectedEndDate) params.endDate = selectedEndDate;
            if (selectedFilterPeriod) params.classPeriod = selectedFilterPeriod;
          } else {
            if (selectedDate) params.date = selectedDate;
            if (selectedClassPeriod) params.classPeriod = selectedClassPeriod;
          }
          if (selectedYear) params.year = selectedYear;
          if (selectedClass) params.class = selectedClass;
        }
        const res = await axios.get(`${API_URL}/api/attendance`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });
        setAttendance(res.data);
      } catch (err) {
        console.error('Error fetching attendance:', err);
      }
    };

    const fetchStudents = async () => {
      try {
        const params = {};
        if (selectedYear) params.year = selectedYear;
        if (selectedClass) params.class = selectedClass;
        const res = await axios.get(`${API_URL}/api/attendance/students`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });
        setStudents(res.data);
      } catch (err) {
        console.error('Error fetching students:', err);
      }
    };

    fetchAttendance();
    if (role !== 'student') {
      fetchStudents();
    }

    if (role === 'exam cell') {
      const fetchFaculty = async () => {
        try {
          const res = await axios.get(`${API_URL}/api/attendance/faculty`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setFacultyList(res.data);
        } catch (err) { console.error('Error fetching faculty', err); }
      };
      fetchFaculty();
    }

    // Fetch class schedules for all roles
    const fetchSchedules = async () => {
      try {
        const params = {};
        if (role === 'faculty' || role === 'exam cell') {
          if (searchMode === 'range') {
            if (selectedStartDate) params.startDate = selectedStartDate;
            if (selectedEndDate) params.endDate = selectedEndDate;
          } else {
            if (selectedDate) params.date = selectedDate;
          }
          if (selectedClass) params.branch = selectedClass;
          if (selectedYear) params.year = selectedYear;
        } else {
          params.date = selectedDate; // student: auto-scoped by backend
        }
        const res = await axios.get(`${API_URL}/api/attendance/schedule`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });
        setSchedules(res.data);
      } catch (err) {
        console.error('Error fetching schedules:', err);
      }
    };
    fetchSchedules();
  }, [token, selectedDate, selectedClassPeriod, selectedStartDate, selectedEndDate, selectedFilterPeriod, selectedYear, selectedClass, selectedRollNumber, role, searchMode]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => console.error('Error playing video:', err));
    }
  }, [stream]);

  const handleMarkAttendance = async (studentId, status) => {
    try {
      await axios.post(`${API_URL}/api/attendance`, {
        studentId,
        date: selectedDate,
        status,
        classPeriod: selectedClassPeriod
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh attendance data
      const res = await axios.get(`${API_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: selectedDate, classPeriod: selectedClassPeriod }
      });
      setAttendance(res.data);
    } catch (err) {
      alert('Error marking attendance');
    }
  };

  const handleAssignClass = async (e) => {
    e.preventDefault();
    setScheduleMsg('');
    try {
      const res = await axios.post(`${API_URL}/api/attendance/schedule`, {
        branch: assignForm.branch,
        year: assignForm.year,
        date: assignForm.date,
        classPeriod: assignForm.classPeriod,
        subject: assignForm.subject
      }, { headers: { Authorization: `Bearer ${token}` } });
      setScheduleMsg('✅ ' + res.data.msg);
      // Refresh schedules
      const sRes = await axios.get(`${API_URL}/api/attendance/schedule`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: assignForm.date, branch: assignForm.branch, year: assignForm.year }
      });
      setSchedules(sRes.data);
    } catch (err) {
      setScheduleMsg('❌ ' + (err.response?.data?.msg || 'Error assigning class'));
    }
  };

  const handleRemoveSchedule = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/attendance/schedule/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedules(prev => prev.filter(s => s._id !== id));
    } catch (err) {
      alert('Error removing schedule');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('name', newStudent.name);
      formData.append('email', newStudent.email);
      formData.append('password', newStudent.password);
      formData.append('role', 'student');
      formData.append('class', newStudent.class);
      formData.append('year', newStudent.year);
      formData.append('rollNumber', newStudent.rollNumber);
      if (newStudent.photos && newStudent.photos.length > 0) {
        newStudent.photos.forEach(file => formData.append('photos', file));
      } else if (newStudent.photo) {
        formData.append('photos', newStudent.photo);
      }

      await axios.post(`${API_URL}/api/auth/register`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage('Student added successfully');
      setShowAddStudentForm(false);
      setNewStudent({ name: '', email: '', password: '', class: selectedClass, year: selectedYear ? Number(selectedYear) : 1, rollNumber: '', photo: null });
      // Refresh students list
      const res = await axios.get(`${API_URL}/api/attendance/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(res.data);
    } catch (err) {
      const msg = err?.response?.data?.msg || err?.response?.data || err?.message || 'Error adding student';
      setMessage(`Error adding student: ${msg}`);
    }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('name', newFaculty.name);
      formData.append('email', newFaculty.email);
      formData.append('password', newFaculty.password);
      formData.append('role', 'faculty');
      if (newFaculty.subject) {
        formData.append('subject', newFaculty.subject);
      }
      if (newFaculty.photos && newFaculty.photos.length > 0) {
        newFaculty.photos.forEach(file => formData.append('photos', file));
      } else if (newFaculty.photo) {
        formData.append('photos', newFaculty.photo);
      }

      await axios.post(`${API_URL}/api/auth/register`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setMessage('Faculty added successfully');
      setShowAddFacultyForm(false);
      setNewFaculty({ name: '', email: '', password: '', subject: '', photo: null });

      // Refresh faculty list dynamically
      if (role === 'exam cell') {
        const res = await axios.get(`${API_URL}/api/attendance/faculty`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFacultyList(res.data);
      }
    } catch (err) {
      const msg = err?.response?.data?.msg || err?.response?.data || err?.message || 'Error adding faculty';
      setMessage(`Error adding faculty: ${msg}`);
    }
  };

  const handleEditClick = (student) => {
    setEditingStudent({ ...student, photo: null });
    setShowEditStudentForm(true);
  };

  const handleEditChange = (e) => {
    const { id, value } = e.target;
    setEditingStudent(prev => ({
      ...prev,
      [id]: id === 'year' ? parseInt(value) : value
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const { _id, name, email, password } = editingStudent;
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('password', password);
      if (editingStudent.class) formData.append('class', editingStudent.class);
      if (editingStudent.year) formData.append('year', editingStudent.year);
      if (editingStudent.rollNumber) formData.append('rollNumber', editingStudent.rollNumber);
      if (editingStudent.photos && editingStudent.photos.length > 0) {
        editingStudent.photos.forEach(file => formData.append('photos', file));
      } else if (editingStudent.photo) {
        formData.append('photos', editingStudent.photo);
      }

      await axios.put(`${API_URL}/api/auth/users/${_id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage('Student updated successfully');
      setShowEditStudentForm(false);
      setEditingStudent(null);
      // Refresh students list
      const res = await axios.get(`${API_URL}/api/attendance/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(res.data);
    } catch (err) {
      const msg = err?.response?.data?.msg || err?.response?.data || err?.message || 'Error updating student';
      setMessage(`Error updating student: ${msg}`);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm("Are you sure you want to delete this student?")) return;
    try {
      await axios.delete(`${API_URL}/api/auth/users/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage('Student deleted successfully');
      setStudents(prev => prev.filter(s => s._id !== studentId));
    } catch (err) {
      setMessage('Error deleting student');
    }
  };

  const handleDeleteFaculty = async (facultyId) => {
    if (!window.confirm("Are you sure you want to delete this faculty member?")) return;
    try {
      await axios.delete(`${API_URL}/api/auth/users/${facultyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage('Faculty deleted successfully');
      setFacultyList(prev => prev.filter(f => f._id !== facultyId));
    } catch (err) {
      setMessage('Error deleting faculty');
    }
  };

  const openCamera = async (target) => {
    try {
      setCameraTarget(target);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      setShowCamera(true);
      setVideoReady(false);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert('Error accessing camera: ' + err.message);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    try {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      
      const BURST_COUNT = 30;
      const TIME_BETWEEN_FRAMES = 100; // ms
      const capturedPhotos = [];
      let currentFrame = 0;
      
      setCaptureProgress(1); // Inform UI immediately
      
      const captureNextFrame = () => {
        if (currentFrame >= BURST_COUNT) {
          // Finished bursting
          if (cameraTarget === 'addStudent') {
            setNewStudent((prev) => ({ ...prev, photos: capturedPhotos, photo: capturedPhotos[0] }));
          } else if (cameraTarget === 'editStudent') {
            setEditingStudent((prev) => ({ ...prev, photos: capturedPhotos, photo: capturedPhotos[0] }));
          } else if (cameraTarget === 'addFaculty') {
            setNewFaculty((prev) => ({ ...prev, photos: capturedPhotos, photo: capturedPhotos[0] }));
          }
          
          setCaptureProgress(0);
          closeCamera();
          return;
        }
        
        setCaptureProgress(currentFrame + 1); // Paint progress
        
        context.drawImage(videoRef.current, 0, 0);
        
        canvasRef.current.toBlob((blob) => {
          let fileName = 'burst.jpg';
          if (cameraTarget === 'addStudent') {
            fileName = newStudent?.rollNumber ? `${newStudent.rollNumber}_${currentFrame}.jpg` : `student_${currentFrame}.jpg`;
          } else if (cameraTarget === 'editStudent') {
            fileName = editingStudent?.rollNumber ? `${editingStudent.rollNumber}_${currentFrame}.jpg` : `student_${currentFrame}.jpg`;
          } else if (cameraTarget === 'addFaculty') {
            const key = newFaculty.email || newFaculty.name || 'faculty';
            fileName = `${key}_${currentFrame}.jpg`;
          }
          
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          capturedPhotos.push(file);
          
          currentFrame++;
          setTimeout(captureNextFrame, TIME_BETWEEN_FRAMES);
        }, 'image/jpeg', 0.6);
      };
      
      // Start loop safely allowing event loop repaints
      setTimeout(captureNextFrame, 50);

    } catch (err) {
      console.error('Error in burst capture:', err);
      alert('Error extracting photos from camera stream.');
      setCaptureProgress(0);
      closeCamera();
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
    setVideoReady(false);
    setCameraTarget(null);
  };

  const fetchStudentChartData = async () => {
    if (!selectedRollNumber || !selectedStartDate || !selectedEndDate) {
      alert('Please enter roll number and select date range');
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/attendance/student/${selectedRollNumber}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { startDate: selectedStartDate, endDate: selectedEndDate }
      });
      const data = res.data;

      // Process data for chart: group by date and count present days
      const dateMap = {};
      data.forEach(record => {
        const dateStr = new Date(record.date).toISOString().split('T')[0];
        if (!dateMap[dateStr]) {
          dateMap[dateStr] = { present: 0, total: 0 };
        }
        dateMap[dateStr].total++;
        if (record.status === 'present') {
          dateMap[dateStr].present++;
        }
      });

      const chartData = Object.keys(dateMap).sort().map(date => ({
        date,
        present: dateMap[date].present,
        total: dateMap[date].total
      }));

      setStudentChartData(chartData);
    } catch (err) {
      console.error('Error fetching student chart data:', err);
      alert('Error fetching chart data');
    }
  };





  const getRelevantRecords = () => (role === 'faculty' && searchMode === 'range') ? facultyAttendance : attendance;

  // Mark every student who doesn't have a present record as absent
  const handleMarkAllAbsent = async () => {
    const unmarked = students.filter(s => {
      const list = getRelevantRecords();
      const rec = list.find(att => att.student && att.student._id === s._id);
      return !rec;
    });
    if (unmarked.length === 0) { setMessage('All students already have a record.'); return; }
    try {
      await Promise.all(unmarked.map(s =>
        axios.post(`${API_URL}/api/attendance`, {
          studentId: s._id, date: selectedDate,
          status: 'absent', classPeriod: selectedClassPeriod
        }, { headers: { Authorization: `Bearer ${token}` } })
      ));
      setMessage(`Marked ${unmarked.length} student(s) absent.`);
      const res = await axios.get(`${API_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: selectedDate, classPeriod: selectedClassPeriod }
      });
      setAttendance(res.data);
    } catch (err) {
      setMessage('Error marking absent: ' + (err.response?.data?.msg || err.message));
    }
  };

  const getAttendanceStatus = (studentId) => {
    const list = getRelevantRecords();
    if (!list || list.length === 0) return 'absent';
    const record = list.find(att => att.student && att.student._id === studentId);
    return record ? record.status : 'absent';
  };

  const getAttendanceSource = (studentId) => {
    const list = getRelevantRecords();
    if (!list || list.length === 0) return 'Auto';
    const record = list.find(att => att.student && att.student._id === studentId);
    return record ? (record.markedBy ? 'Manual' : 'Auto') : 'Auto';
  };

  const getAttendanceRecord = (studentId) => {
    const list = getRelevantRecords();
    if (!list || list.length === 0) return null;
    return list.find(att => att.student && att.student._id === studentId);
  };

  // Group students by class
  const groupedByClass = students.reduce((acc, student) => {
    const className = student.class || 'Unassigned';
    if (!acc[className]) {
      acc[className] = [];
    }
    acc[className].push(student);
    return acc;
  }, {});

  // Get sorted class names
  const sortedClassNames = Object.keys(groupedByClass).sort();

  // Calculate pie chart data
  const facultyAttendance = role === 'faculty' ? attendance.filter(att => {
    if (!att.student || !att.date) return false;
    const attDateStr = new Date(att.date).toISOString().split('T')[0];
    return schedules.some(s =>
      new Date(s.date).toISOString().split('T')[0] === attDateStr &&
      s.classPeriod === att.classPeriod &&
      (selectedFilterSubject ? (s.subject && s.subject.toLowerCase().includes(selectedFilterSubject.toLowerCase())) : true)
    );
  }) : attendance;

  const presentCount = facultyAttendance.filter(att => att.status === 'present').length;
  const absentCount = facultyAttendance.filter(att => att.status === 'absent').length;
  const pieData = [
    { name: 'Present', value: presentCount, color: '#28a745' },
    { name: 'Absent', value: absentCount, color: '#dc3545' }
  ];

  // Generate daywise chart data for students
  const generateStudentChartData = () => {
    if (role !== 'student' || !attendance.length) return [];
    const dateMap = {};
    attendance.forEach(record => {
      const dateStr = new Date(record.date).toISOString().split('T')[0];
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { present: 0, total: 0 };
      }
      dateMap[dateStr].total++;
      if (record.status === 'present') {
        dateMap[dateStr].present++;
      }
    });
    return Object.keys(dateMap).sort().map(date => ({
      date,
      present: dateMap[date].present,
      total: dateMap[date].total
    }));
  };

  const studentDaywiseData = generateStudentChartData();

  const generateExamCellDaywiseChartData = () => {
    if (role !== 'exam cell' || !attendance || !attendance.length) return [];
    
    const dateMap = {}; // dateStr -> { studentStatusMap: {} }
    
    // Group records by date
    attendance.forEach(att => {
      if (att.student && att.student._id && att.date) {
        const dateStr = new Date(att.date).toISOString().split('T')[0];
        
        if (!dateMap[dateStr]) {
          dateMap[dateStr] = { studentStatusMap: {} };
        }
        
        // Mark student as present for the given day if they are present in ANY period that day
        if (!dateMap[dateStr].studentStatusMap[att.student._id]) {
          dateMap[dateStr].studentStatusMap[att.student._id] = false;
        }
        if (att.status === 'present') {
          dateMap[dateStr].studentStatusMap[att.student._id] = true;
        }
      }
    });

    return Object.keys(dateMap).sort().map(date => {
      let present = 0;
      let total = 0;
      Object.values(dateMap[date].studentStatusMap).forEach(isPresent => {
        total++;
        if (isPresent) present++;
      });
      return {  date, present, total };
    });
  };
  const examCellDaywiseBarData = generateExamCellDaywiseChartData();

  return (
    <div>
      <h2>Student Attendance Dashboard</h2>

      {/* ── FACULTY: Assign Class Panel ── */}
      {role === 'faculty' && (
        <div className="class-section" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>📅 My Class Assignments</h3>
            <button className="btn-submit" onClick={() => setShowAssignClass(!showAssignClass)}>
              {showAssignClass ? 'Hide Form' : '+ Assign Class'}
            </button>
          </div>

          {/* Assign form */}
          {showAssignClass && (
            <form onSubmit={handleAssignClass} style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div className="chart-field">
                <label className="chart-label">Branch</label>
                <input type="text" className="chart-input" placeholder="e.g. Computer Science" value={assignForm.branch} onChange={e => setAssignForm({ ...assignForm, branch: e.target.value })} required />
              </div>
              <div className="chart-field">
                <label className="chart-label">Year</label>
                <input type="number" className="chart-input" placeholder="e.g. 1" value={assignForm.year} onChange={e => setAssignForm({ ...assignForm, year: e.target.value })} required />
              </div>
              <div className="chart-field">
                <label className="chart-label">Date</label>
                <input type="date" className="chart-input" value={assignForm.date} onChange={e => setAssignForm({ ...assignForm, date: e.target.value })} required />
              </div>
              <div className="chart-field">
                <label className="chart-label">Period</label>
                <select className="chart-input" value={assignForm.classPeriod} onChange={e => setAssignForm({ ...assignForm, classPeriod: e.target.value })} required>
                  {[1, 2, 3, 4, 5, 6].map(p => <option key={p} value={p}>Period {p}</option>)}
                </select>
              </div>
              <div className="chart-field">
                <label className="chart-label">Subject (optional)</label>
                <input type="text" className="chart-input" placeholder="Override subject" value={assignForm.subject} onChange={e => setAssignForm({ ...assignForm, subject: e.target.value })} />
              </div>
              <button type="submit" className="btn-submit chart-btn">Assign</button>
            </form>
          )}
          {scheduleMsg && <p style={{ marginTop: '10px', fontWeight: 600 }}>{scheduleMsg}</p>}

          {/* My assigned classes table */}
          {schedules.length > 0 && (
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <table className="attendance-table">
                <thead>
                  <tr className="table-header-row">
                    <th className="table-header">Date</th>
                    <th className="table-header">Branch</th>
                    <th className="table-header">Year</th>
                    <th className="table-header">Period</th>
                    <th className="table-header">Subject</th>
                    <th className="table-header">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <tr key={s._id} className="table-row">
                      <td className="table-cell">{new Date(s.date).toISOString().split('T')[0]}</td>
                      <td className="table-cell">{s.branch?.toUpperCase()}</td>
                      <td className="table-cell">{s.year} Year</td>
                      <td className="table-cell">Period {s.classPeriod}</td>
                      <td className="table-cell">{s.subject || '—'}</td>
                      <td className="table-cell">
                        <button className="btn-absent" onClick={() => handleRemoveSchedule(s._id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FACULTY: Dedicated Attendance Filter Card ── */}
      {role === 'faculty' && (
        <div className="class-section" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0 }}>🔍 Filter Student Attendance</h3>
            {(selectedYear || selectedClass) && (
              <button
                className="btn-edit"
                style={{ fontSize: '13px', padding: '6px 14px' }}
                onClick={() => { setSelectedYear(''); setSelectedClass(''); setSelectedRollNumber(''); }}
              >
                ✕ Clear Filters
              </button>
            )}
          </div>

          {/* Active filter summary badge */}
          {(selectedYear || selectedClass) && (
            <div style={{
              display: 'inline-flex', gap: '8px', flexWrap: 'wrap',
              marginBottom: '14px'
            }}>
              {selectedYear && (
                <span style={{ background: 'rgba(0, 187, 249, 0.2)', color: '#00bbf9', border: '1px solid rgba(0, 187, 249, 0.3)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600, fontSize: '13px', textShadow: '0 0 10px rgba(0, 187, 249, 0.5)', backdropFilter: 'blur(10px)' }}>
                  📅 Year {selectedYear}
                </span>
              )}
              {selectedClass && (
                <span style={{ background: 'rgba(155, 93, 229, 0.2)', color: '#de87ff', border: '1px solid rgba(155, 93, 229, 0.3)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600, fontSize: '13px', textShadow: '0 0 10px rgba(155, 93, 229, 0.5)', backdropFilter: 'blur(10px)' }}>
                  🏫 {selectedClass.toUpperCase()}
                </span>
              )}
              {selectedRollNumber && (
                <span style={{ background: 'rgba(0, 245, 212, 0.2)', color: '#00f5d4', border: '1px solid rgba(0, 245, 212, 0.3)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600, fontSize: '13px', textShadow: '0 0 10px rgba(0, 245, 212, 0.5)', backdropFilter: 'blur(10px)' }}>
                  🎓 Roll: {selectedRollNumber}
                </span>
              )}
            </div>
          )}

          <div className="chart-controls" style={{ marginBottom: 0 }}>
            <div className="chart-field">
              <label className="chart-label">Year</label>
              <input
                type="number"
                id="year"
                placeholder="All Years"
                value={selectedYear}
                onChange={(e) => { setSelectedYear(e.target.value); setSearchMode('range'); }}
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label className="chart-label">Branch</label>
              <input
                type="text"
                id="class"
                placeholder="All Branches"
                value={selectedClass}
                onChange={(e) => { setSelectedClass(e.target.value); setSearchMode('range'); }}
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label className="chart-label">Start Date</label>
              <input
                type="date"
                id="startDateFilter"
                value={selectedStartDate}
                onChange={(e) => { setSelectedStartDate(e.target.value); setSearchMode('range'); }}
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label className="chart-label">End Date</label>
              <input
                type="date"
                id="endDateFilter"
                value={selectedEndDate}
                onChange={(e) => { setSelectedEndDate(e.target.value); setSearchMode('range'); }}
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label className="chart-label">Subject</label>
              <input
                type="text"
                value={selectedFilterSubject}
                onChange={(e) => { setSelectedFilterSubject(e.target.value); setSearchMode('range'); }}
                placeholder="e.g. Physics"
                className="chart-input"
              />
            </div>
          </div>

          {searchMode === 'range' && (
            <div className="chart-section" style={{ marginTop: '20px' }}>
              <h3>Attendance Summary for {selectedFilterSubject ? selectedFilterSubject + ' (Filtered)' : 'Your Subject(s)'} - {selectedYear || 'All'} Year {(selectedClass || 'All').toUpperCase()} Class ({selectedStartDate || 'Any'} to {selectedEndDate || 'Any'})</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <p>Total Present: {presentCount}, Absent: {absentCount} (Total Records: {presentCount + absentCount})</p>
            </div>
          )}
        </div>
      )}

      {/* ── FACULTY: Single Period Filter ── */}
      {role === 'faculty' && (
        <div className="class-section" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0 }}>🔍 View/Mark Student Attendance (Single Period)</h3>
          </div>
          <div className="chart-controls" style={{ marginBottom: 0 }}>
            <div className="chart-field">
              <label className="chart-label">Year</label>
              <input type="number" placeholder="All Years" value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setSearchMode('single'); }} className="chart-input" />
            </div>
            <div className="chart-field">
              <label className="chart-label">Branch</label>
              <input type="text" placeholder="All Branches" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSearchMode('single'); }} className="chart-input" />
            </div>
            <div className="chart-field">
              <label className="chart-label">Date</label>
              <input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSearchMode('single'); }} className="chart-input" />
            </div>
            <div className="chart-field">
              <label className="chart-label">Period</label>
              <select value={selectedClassPeriod} onChange={(e) => { setSelectedClassPeriod(Number(e.target.value)); setSearchMode('single'); }} className="chart-input">
                {[1, 2, 3, 4, 5, 6].map(num => <option key={num} value={num}>Period {num}</option>)}
              </select>
            </div>
            <button onClick={() => setSearchMode('single')} className="btn-submit chart-btn">View Period</button>
          </div>
        </div>
      )}

      {/* ── EXAM CELL: Filters ── */}
      {role === 'exam cell' && (
        <div className="class-section" style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: 0, marginBottom: '14px' }}>🔍 Exam Cell Filters</h3>
          <div className="filters">
            <label htmlFor="yearEc" className="filter-label">Select Year: </label>
            <input
              type="number"
              id="yearEc"
              placeholder="All Years"
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value); setSearchMode('range'); }}
              className="filter-input"
            />
            <label htmlFor="classEc" className="filter-label">Select Class: </label>
            <input
              type="text"
              id="classEc"
              placeholder="All Classes"
              value={selectedClass}
              onChange={(e) => { setSelectedClass(e.target.value); setSearchMode('range'); }}
              className="filter-input"
            />
            <label htmlFor="startDateEc" className="filter-label">Start Date: </label>
            <input
              type="date"
              id="startDateEc"
              value={selectedStartDate}
              onChange={(e) => { setSelectedStartDate(e.target.value); setSearchMode('range'); }}
              className="filter-input"
            />
            <label htmlFor="endDateEc" className="filter-label">End Date: </label>
            <input
              type="date"
              id="endDateEc"
              value={selectedEndDate}
              onChange={(e) => { setSelectedEndDate(e.target.value); setSearchMode('range'); }}
              className="filter-input"
            />
            <label htmlFor="periodEc" className="filter-label">Period: </label>
            <select
              id="periodEc"
              value={selectedFilterPeriod}
              onChange={(e) => { setSelectedFilterPeriod(e.target.value); setSearchMode('range'); }}
              className="filter-select"
            >
              <option value="">All Periods</option>
              {[1, 2, 3, 4, 5, 6].map(num => (
                <option key={num} value={num}>Period {num}</option>
              ))}
            </select>
          </div>

          {searchMode === 'range' && (
            <div className="chart-section" style={{ marginTop: '20px' }}>
              <h3>Overall Attendance Summary ({selectedFilterPeriod ? 'Period ' + selectedFilterPeriod : 'All Periods'}) - {selectedYear || 'All'} Year {(selectedClass || 'All').toUpperCase()} Class ({selectedStartDate || 'Any'} to {selectedEndDate || 'Any'})</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <p>Total Present: {presentCount}, Absent: {absentCount} (Total Records: {presentCount + absentCount})</p>
            </div>
          )}

          {searchMode === 'range' && (
            <div className="chart-section" style={{ marginTop: '20px' }}>
              <h3>Day-wise Attendance Breakdown for {selectedYear || 'All'} Year {(selectedClass || 'All').toUpperCase()} Class ({selectedStartDate || 'Any'} to {selectedEndDate || 'Any'})</h3>
              {examCellDaywiseBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={examCellDaywiseBarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" fill="#28a745" name="Total Present Students" />
                    <Bar dataKey="total" fill="#007bff" name="Total Tracked Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{textAlign: 'center', marginTop: '20px'}}>No records found for this date range.</p>
              )}
            </div>
          )}

          <div className="class-section" style={{ marginTop: '20px' }}>
            <h3>👨‍🏫 Your Faculty List</h3>
            {facultyList.length > 0 ? (
              <table className="attendance-table">
                <thead>
                  <tr className="table-header-row">
                    <th className="table-header">Name</th>
                    <th className="table-header">Email</th>
                    <th className="table-header">Subject</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyList.map(faculty => (
                    <tr key={faculty._id} className="table-row">
                      <td className="table-cell">{faculty.name}</td>
                      <td className="table-cell">{faculty.email}</td>
                      <td className="table-cell">{faculty.subject || 'Not Set'}</td>
                      <td className="table-cell">
                        <button
                          onClick={() => handleDeleteFaculty(faculty._id)}
                          className="btn-absent"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No faculty registered under your Exam Cell.</p>
            )}
          </div>
        </div>
      )}




      {message && <p className={`message ${message.includes('Error') ? 'message-error' : 'message-success'}`}>{message}</p>}

      <div className="total-students">
        <h3>Total Students: {students.length}</h3>
        <p className="debug-info">
          Debug: Attendance records loaded: {attendance.length}
        </p>
        {role === 'exam cell' && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (!showAddStudentForm) {
                  setNewStudent({ name: '', email: '', password: '', class: selectedClass, year: selectedYear ? Number(selectedYear) : 1, rollNumber: '', photo: null });
                }
                setShowAddStudentForm(!showAddStudentForm);
                if (!showAddStudentForm) setShowAddFacultyForm(false);
              }}
              className="btn-add-student"
            >
              {showAddStudentForm ? 'Cancel Student' : 'Add Student'}
            </button>
            <button
              onClick={() => {
                if (!showAddFacultyForm) {
                  setNewFaculty({ name: '', email: '', password: '', photo: null });
                }
                setShowAddFacultyForm(!showAddFacultyForm);
                if (!showAddFacultyForm) {
                  setNewFaculty({ name: '', email: '', password: '', subject: '', photo: null });
                  setShowAddStudentForm(false);
                }
              }}
              className="btn-add-student"
            >
              {showAddFacultyForm ? 'Cancel Faculty' : 'Add Faculty'}
            </button>
          </div>
        )}
      </div>

      {showAddStudentForm && (
        <form onSubmit={handleAddStudent} className="add-student-form">
          <h3>Add New Student</h3>
          <div className="form-field">
            <label htmlFor="name">Name: </label>
            <input
              type="text"
              id="name"
              value={newStudent.name}
              onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="email">Email: </label>
            <input
              type="email"
              id="email"
              value={newStudent.email}
              onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password: </label>
            <input
              type="password"
              id="password"
              value={newStudent.password}
              onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="class">Class: </label>
            <input
              type="text"
              id="class"
              placeholder="e.g. Computer Science"
              value={newStudent.class}
              onChange={(e) => setNewStudent({ ...newStudent, class: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="year">Year: </label>
            <input
              type="number"
              id="year"
              placeholder="e.g. 1"
              value={newStudent.year}
              onChange={(e) => setNewStudent({ ...newStudent, year: parseInt(e.target.value) })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="rollNumber">Roll Number: </label>
            <input
              type="text"
              id="rollNumber"
              value={newStudent.rollNumber}
              onChange={(e) => setNewStudent({ ...newStudent, rollNumber: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label>Photo: </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="button" onClick={() => openCamera('addStudent')} className="btn-camera">
                Take Photo
              </button>
              <input
                type="file"
                id="photo"
                accept="image/*"
                onChange={(e) => setNewStudent({ ...newStudent, photo: e.target.files[0] })}
                style={{ display: 'none' }}
              />
              <label htmlFor="photo" className="btn-upload">
                Upload File
              </label>
              {newStudent.photo && <span>Photo selected</span>}
            </div>
          </div>
          <button
            type="submit"
            className="btn-submit"
          >
            Add Student
          </button>
        </form>
      )}

      {showAddFacultyForm && (
        <form onSubmit={handleAddFaculty} className="add-student-form">
          <h3>Add New Faculty</h3>
          <div className="form-field">
            <label htmlFor="facultyName">Name: </label>
            <input
              type="text"
              id="facultyName"
              value={newFaculty.name}
              onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="facultyEmail">Email: </label>
            <input
              type="email"
              id="facultyEmail"
              value={newFaculty.email}
              onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="facultyPassword">Password: </label>
            <input
              type="password"
              id="facultyPassword"
              value={newFaculty.password}
              onChange={(e) => setNewFaculty({ ...newFaculty, password: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="facultySubject">Subject: </label>
            <input
              type="text"
              id="facultySubject"
              value={newFaculty.subject}
              onChange={(e) => setNewFaculty({ ...newFaculty, subject: e.target.value })}
              placeholder="e.g. Mathematics, Physics"
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label>Photo (optional): </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="button" onClick={() => openCamera('addFaculty')} className="btn-camera">
                Take Photo
              </button>
              <input
                type="file"
                id="facultyPhoto"
                accept="image/*"
                onChange={(e) => setNewFaculty({ ...newFaculty, photo: e.target.files[0] })}
                style={{ display: 'none' }}
              />
              <label htmlFor="facultyPhoto" className="btn-upload">
                Upload File
              </label>
              {newFaculty.photo && <span>Photo selected</span>}
            </div>
          </div>
          <button type="submit" className="btn-submit">Add Faculty</button>
        </form>
      )}

      {showCamera && (
        <div className="camera-modal">
          <div className="camera-content">
            <h3>Take Photo</h3>
            {!videoReady && <p>Loading camera...</p>}
            <video
              ref={videoRef}
              onCanPlay={() => {
                if (videoRef.current && videoRef.current.videoWidth > 0) {
                  setVideoReady(true);
                }
              }}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                maxWidth: '400px',
                height: '300px',
                objectFit: 'cover',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
            <div style={{ marginTop: '10px' }}>
              <button 
                onClick={capturePhoto} 
                className="btn-capture" 
                disabled={!videoReady || captureProgress > 0}
              >
                {!videoReady ? 'Loading...' : captureProgress > 0 ? `Capturing ${captureProgress}/30...` : 'Capture Photos'}
              </button>
              <button 
                onClick={closeCamera} 
                className="btn-cancel" 
                style={{ marginLeft: '10px' }}
                disabled={captureProgress > 0}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {sortedClassNames.map((className, index) => (
        <div key={className} className="class-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Class: {className}</h3>
            {(role === 'faculty' || role === 'exam cell') && (
              <button
                onClick={handleMarkAllAbsent}
                className="btn-absent"
                title="Mark all students without a record as absent for the selected date & period"
                style={{ marginBottom: '8px' }}
              >
                ✗ Mark All Absent
              </button>
            )}
          </div>
          <table className="attendance-table">
            <thead>
              <tr className="table-header-row">
                <th className="table-header">Roll Number</th>
                <th className="table-header">Student Name</th>
                <th className="table-header">Email</th>
                <th className="table-header">Status</th>
                <th className="table-header">Source</th>
                <th className="table-header">Date</th>
                <th className="table-header">Time</th>
                {(role === 'faculty' || role === 'exam cell') && (
                  <th className="table-header">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {groupedByClass[className].map(student => {
                const status = getAttendanceStatus(student._id);
                const source = getAttendanceSource(student._id);

                return (
                  <tr key={student._id} className="table-row">
                    <td className="table-cell">{student.rollNumber || 'N/A'}</td>
                    <td className="table-cell">{student.name}</td>
                    <td className="table-cell">{student.email}</td>
                    <td className="table-cell">
                      <span className={`status status-${status.toLowerCase().replace(' ', '-')}`}>
                        {status}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`source source-${source.toLowerCase()}`}>
                        {source}
                      </span>
                    </td>
                    <td className="table-cell">
                      {(() => {
                        const record = getAttendanceRecord(student._id);
                        if (record && record.date) {
                          const recordDate = new Date(record.date);
                          return recordDate.toISOString().split('T')[0]; // Show date in YYYY-MM-DD format
                        }
                        return selectedDate; // Fallback to selected date if no record
                      })()}
                    </td>
                    <td className="table-cell">
                      {(() => {
                        const record = getAttendanceRecord(student._id);
                        if (record && record.time) {
                          return record.time; // Show time in HH:MM:SS format
                        }
                        return 'N/A'; // Show N/A if no time recorded
                      })()}
                    </td>
                    {(role === 'faculty' || role === 'exam cell') && (
                      <td className="table-cell">
                        <button
                          onClick={() => handleMarkAttendance(student._id, 'present')}
                          className="btn-present"
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleMarkAttendance(student._id, 'absent')}
                          className="btn-absent"
                        >
                          Absent
                        </button>
                        {role === 'exam cell' && (
                          <>
                            <button
                              onClick={() => handleEditClick(student)}
                              className="btn-edit"
                              style={{ marginLeft: '5px' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(student._id)}
                              className="btn-absent"
                              style={{ marginLeft: '5px' }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Insert 10 minutes break after every 2 classes */}
          {/* {(index + 1) % 2 === 0 && index !== sortedClassNames.length - 1 && (
            <div style={{
              marginTop: '20px',
              marginBottom: '20px',
              padding: '10px',
              backgroundColor: '#e0e0e0',
              textAlign: 'center',
              fontWeight: 'bold',
              borderRadius: '4px'
            }}>
              10 Minutes Break
            </div>
          )} */}
        </div>
      ))}



      {(role === 'faculty' || role === 'exam cell') && (
        <div className="chart-section">
          <h3>Student Attendance Chart</h3>
          <div className="chart-controls">
            <div className="chart-field">
              <label htmlFor="chartRollNumber" className="chart-label">Roll Number:</label>
              <input
                type="text"
                id="chartRollNumber"
                value={selectedRollNumber}
                onChange={(e) => setSelectedRollNumber(e.target.value)}
                placeholder="Roll number"
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label htmlFor="startDate" className="chart-label">Start Date:</label>
              <input
                type="date"
                id="startDate"
                value={selectedStartDate}
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="chart-input"
              />
            </div>
            <div className="chart-field">
              <label htmlFor="endDate" className="chart-label">End Date:</label>
              <input
                type="date"
                id="endDate"
                value={selectedEndDate}
                onChange={(e) => setSelectedEndDate(e.target.value)}
                className="chart-input"
              />
            </div>
            <button onClick={fetchStudentChartData} className="btn-submit chart-btn">
              Generate Chart
            </button>
          </div>
          {studentChartData.length > 0 && (
            <div>
              <h4>Attendance for Roll Number: {selectedRollNumber}</h4>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={studentChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="present" fill="#28a745" name="Present Days" />
                  <Bar dataKey="total" fill="#007bff" name="Total Periods" />
                </BarChart>
              </ResponsiveContainer>
              <p>Total Present Days: {studentChartData.reduce((sum, item) => sum + item.present, 0)}, Total Periods: {studentChartData.reduce((sum, item) => sum + item.total, 0)}</p>
            </div>
          )}
        </div>
      )}

      {showEditStudentForm && editingStudent && (
        <form onSubmit={handleEditSubmit} className="edit-student-form">
          <h3>Edit Student</h3>
          <div className="form-field">
            <label htmlFor="name">Name: </label>
            <input
              type="text"
              id="name"
              value={editingStudent.name}
              onChange={handleEditChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="email">Email: </label>
            <input
              type="email"
              id="email"
              value={editingStudent.email}
              onChange={handleEditChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password: </label>
            <input
              type="password"
              id="password"
              value={editingStudent.password || ''}
              onChange={handleEditChange}
              placeholder="Leave blank to keep current password"
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="class">Class: </label>
            <input
              type="text"
              id="class"
              placeholder="e.g. Computer Science"
              value={editingStudent.class || ''}
              onChange={handleEditChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="year">Year: </label>
            <input
              type="number"
              id="year"
              placeholder="e.g. 1"
              value={editingStudent.year || ''}
              onChange={handleEditChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="rollNumber">Roll Number: </label>
            <input
              type="text"
              id="rollNumber"
              value={editingStudent.rollNumber || ''}
              onChange={handleEditChange}
              required
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label>Photo: </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="button" onClick={() => openCamera('editStudent')} className="btn-camera">
                Take Photo
              </button>
              <input
                type="file"
                id="editPhoto"
                accept="image/*"
                onChange={(e) => setEditingStudent({ ...editingStudent, photo: e.target.files[0] })}
                style={{ display: 'none' }}
              />
              <label htmlFor="editPhoto" className="btn-upload">
                Upload File
              </label>
              {editingStudent.photo && <span>Photo selected</span>}
            </div>
          </div>
          <button type="submit" className="btn-submit">Update Student</button>
          <button type="button" className="btn-cancel" onClick={() => setShowEditStudentForm(false)}>Cancel</button>
        </form>
      )}

      {role === 'student' && (
        <div className="student-view">
          <h3>Your Attendance Records</h3>
          <div className="filters" style={{ marginBottom: '20px' }}>
            <label htmlFor="studentDate" className="filter-label">Select Date: </label>
            <input
              type="date"
              id="studentDate"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="filter-input"
            />
          </div>

          {/* Today's schedule — faculty + subject */}
          <div className="class-section" style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '12px' }}>📚 Today's Class Schedule</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {[1, 2, 3, 4, 5, 6].map(period => {
                const slot = schedules.find(s => s.classPeriod === period);
                return (
                  <div key={period} style={{
                    flex: '1 1 140px',
                    background: slot ? 'linear-gradient(135deg,#2563eb,#4f46e5)' : '#f1f5f9',
                    color: slot ? 'white' : '#64748b',
                    borderRadius: '12px',
                    padding: '14px',
                    textAlign: 'center',
                    boxShadow: slot ? '0 4px 15px rgba(37,99,235,0.3)' : 'none'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>Period {period}</div>
                    {slot ? (
                      <>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{slot.subject || 'null'}</div>
                        <div style={{ fontSize: '12px', opacity: 0.85 }}>👤 {slot.faculty?.name || 'null'}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: '12px' }}>Not Assigned</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <div>
              <h4>Attendance for {selectedDate}</h4>
              <div style={{ overflowX: 'auto' }}>
                <table className="attendance-table">
                  <thead>
                    <tr className="table-header-row">
                      <th className="table-header">Period</th>
                      <th className="table-header">Subject</th>
                      <th className="table-header">Faculty</th>
                      <th className="table-header">Status</th>
                      <th className="table-header">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6].map(period => {
                      const record = attendance.find(att => {
                        const recordDate = new Date(att.date).toISOString().split('T')[0];
                        return recordDate === selectedDate && att.classPeriod === period;
                      });
                      const slot = schedules.find(s => s.classPeriod === period);
                      return (
                        <tr key={period} className="table-row">
                          <td className="table-cell">{period}</td>
                          <td className="table-cell">{slot?.subject || 'null'}</td>
                          <td className="table-cell">{slot?.faculty?.name || 'null'}</td>
                          <td className="table-cell">
                            <span className={`status status-${record ? record.status.toLowerCase() : 'not-marked'}`}>
                              {record ? record.status : 'Not Marked'}
                            </span>
                          </td>
                          <td className="table-cell">{record ? record.time : 'N/A'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Overall Pie Chart */}
          <div className="chart-section">
            <h4>Overall Attendance Summary</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <p>Total Present: {presentCount}, Absent: {absentCount}</p>
          </div>

          {/* Day-wise Chart */}
          <div className="chart-section">
            <h4>Day-wise Attendance (Present Periods per Day)</h4>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={studentDaywiseData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" fill="#28a745" name="Present Periods" />
                <Bar dataKey="total" fill="#007bff" name="Total Periods" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Week-wise Chart */}
          <div className="chart-section">
            <h4>Week-wise Attendance (Present Days per Week)</h4>
            {(() => {
              // Group by week
              const weekMap = {};
              attendance.forEach(record => {
                const date = new Date(record.date);
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                const weekKey = weekStart.toISOString().split('T')[0];
                if (!weekMap[weekKey]) {
                  weekMap[weekKey] = { presentDays: 0, totalDays: 0 };
                }
                // Check if present in any period that day
                const dayKey = date.toISOString().split('T')[0];
                if (!weekMap[weekKey][dayKey]) {
                  weekMap[weekKey][dayKey] = false;
                  weekMap[weekKey].totalDays++;
                }
                if (record.status === 'present') {
                  weekMap[weekKey][dayKey] = true;
                }
              });

              // Calculate present days per week
              const weekData = Object.keys(weekMap).sort().map(week => ({
                week: `Week of ${week}`,
                presentDays: Object.values(weekMap[week]).filter(val => val === true).length,
                totalDays: weekMap[week].totalDays
              }));

              return (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={weekData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="presentDays" fill="#28a745" name="Present Days" />
                    <Bar dataKey="totalDays" fill="#007bff" name="Total Days" />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
export default Attendance;

