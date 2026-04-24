import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Attendance from './Attendance';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem('role');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/');
  };

  const renderContent = () => {
    if (location.pathname === '/attendance' || location.pathname === '/dashboard') {
      return <Attendance />;
    } else {
      return <Attendance />; // Default to attendance
    }
  };

  // Generate particles for the background
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${(i * 8.5) % 100}%`,
    size: 4 + (i % 5),
    color: ['#00f5d4', '#fee440', '#f15bb5', '#9b5de5', '#00bbf9'][i % 5],
    duration: `${10 + (i * 1.5) % 12}s`,
    delay: `${-(i * 1.2)}s`,
  }));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

        /* ANIMATED BACKGROUND */
        .dashboard-container {
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
          background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
          color: white;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* AMBIENT ORBS */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          animation: floatOrb 20s infinite ease-in-out;
          pointer-events: none;
          z-index: 0;
        }
        .orb-1 { width: 500px; height: 500px; background: #9b5de5; top: -100px; left: -100px; animation-duration: 25s; }
        .orb-2 { width: 400px; height: 400px; background: #f15bb5; bottom: -50px; right: -50px; animation-duration: 22s; animation-delay: -5s; }
        .orb-3 { width: 600px; height: 600px; background: #00bbf9; top: 40%; left: 50%; animation-duration: 30s; animation-delay: -10s; }

        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, -50px) scale(1.1); }
          66% { transform: translate(-30px, 40px) scale(0.9); }
        }

        /* RINGS */
        .ring-bg {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
        }
        .orbit-ring {
          border-radius: 50%;
          position: absolute;
          top: 50%; left: 50%;
          border: 1px dashed rgba(255,255,255,0.1);
          animation: spinRing linear infinite;
        }
        .ring-a { width: 80vw; height: 80vw; margin-left: -40vw; margin-top: -40vw; animation-duration: 60s; }
        .ring-b { width: 60vw; height: 60vw; margin-left: -30vw; margin-top: -30vw; animation-duration: 40s; animation-direction: reverse; border: 1px solid rgba(0, 245, 212, 0.05); }

        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* PARTICLES */
        .particle {
          position: absolute;
          border-radius: 50%;
          animation: particleFloat linear infinite;
          pointer-events: none;
          z-index: 0;
        }
        @keyframes particleFloat {
          0% { transform: translateY(100vh) scale(0); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-100px) scale(1.5); opacity: 0; }
        }

        /* HEADER */
        .dash-header {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        
        .dash-title {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(90deg, #00f5d4, #00bbf9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(0, 245, 212, 0.3);
          letter-spacing: 1px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .role-badge {
          background: linear-gradient(135deg, rgba(241, 91, 181, 0.8), rgba(155, 93, 229, 0.8));
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          box-shadow: 0 4px 15px rgba(155, 93, 229, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .logout-btn {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 20px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }
        .logout-btn:hover {
          background: #f15bb5;
          border-color: #f15bb5;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(241, 91, 181, 0.4);
        }

        /* NAVIGATION NAV */
        .dash-nav {
          position: relative;
          z-index: 10;
          padding: 15px 40px;
          display: flex;
          gap: 15px;
        }
        
        .dash-nav-btn {
          background: rgba(0, 187, 249, 0.1);
          color: #00bbf9;
          border: 1px solid rgba(0, 187, 249, 0.3);
          padding: 10px 24px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          backdrop-filter: blur(5px);
        }
        .dash-nav-btn:hover {
          background: #00bbf9;
          color: white;
          transform: translateY(-3px) scale(1.05);
          box-shadow: 0 10px 25px rgba(0, 187, 249, 0.4);
        }

        /* MAIN CONTENT AREA */
        .dash-main {
          position: relative;
          z-index: 10;
          flex: 1;
          padding: 20px 40px 40px 40px;
          display: flex;
          flex-direction: column;
        }

      `}</style>

      <div className="dashboard-container">
        {/* Background Animation Elements */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        
        <div className="ring-bg">
          <div className="orbit-ring ring-a" />
          <div className="orbit-ring ring-b" />
        </div>

        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              boxShadow: `0 0 10px 2px ${p.color}`,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* Header */}
        <header className="dash-header">
          <h1 className="dash-title">Nexus Attendance</h1>
          <div className="user-info">
            <span className="role-badge">{role}</span>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* Navigation */}
        <nav className="dash-nav">
          <button className="dash-nav-btn" onClick={() => navigate('/attendance')}>
            Dashboard
          </button>
        </nav>

        {/* Main Content */}
        <main className="dash-main">
          {renderContent()}
        </main>
      </div>
    </>
  );
};

export default Dashboard;

