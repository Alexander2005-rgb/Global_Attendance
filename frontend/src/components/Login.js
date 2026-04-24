import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL;

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, formData);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);
      navigate("/dashboard");
    } catch (err) {
      alert("Error: " + err.response?.data?.msg);
    }
  };

  const particles = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: `${(i * 7.3) % 100}%`,
    size: 3 + (i % 4),
    color: ['#7c3aed', '#4361ee', '#f72585', '#ffffff', '#4cc9f0'][i % 5],
    duration: `${8 + (i * 1.3) % 10}s`,
    delay: `${-(i * 0.8)}s`,
  }));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

        * { box-sizing: border-box; font-family: 'Inter', 'Segoe UI', sans-serif; }
        body { margin: 0; }

        /* NAVBAR */
        .navbar {
          background: linear-gradient(90deg, #4b1fa6, #3a0ca3);
          padding: 15px 40px;
          color: white;
          box-shadow: 0 8px 20px rgba(0,0,0,0.25);
          position: relative;
          z-index: 10;
        }
        .navbar-container h1 {
          margin: 0;
          font-size: 20px;
          text-align: center;
          letter-spacing: 0.5px;
        }

        /* PAGE */
        .login-page {
          height: calc(100vh - 60px);
          background: linear-gradient(135deg, #0d0221, #1a0545, #0d0221);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }

        /* AMBIENT ORBS */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.3;
          animation: floatOrb linear infinite;
          pointer-events: none;
        }
        .orb-1 { width: 450px; height: 450px; background: radial-gradient(circle, #7c3aed, transparent 70%); top: -130px; left: -110px; animation-duration: 18s; }
        .orb-2 { width: 380px; height: 380px; background: radial-gradient(circle, #4361ee, transparent 70%); bottom: -90px; right: -90px; animation-duration: 22s; animation-delay: -7s; }
        .orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, #f72585, transparent 70%); top: 40%; left: 62%; animation-duration: 15s; animation-delay: -3s; }
        @keyframes floatOrb {
          0%   { transform: translate(0,0) scale(1); }
          33%  { transform: translate(60px,-80px) scale(1.08); }
          66%  { transform: translate(-40px,60px) scale(0.95); }
          100% { transform: translate(0,0) scale(1); }
        }

        /* GRID FLOOR */
        .grid-plane {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%) rotateX(75deg);
          transform-origin: bottom center;
          width: 200%;
          height: 800px;
          background-image:
            linear-gradient(rgba(100,80,255,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(100,80,255,0.15) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridScroll 8s linear infinite;
          pointer-events: none;
        }
        @keyframes gridScroll {
          0%   { background-position: 0 0; }
          100% { background-position: 0 60px; }
        }

        /* RINGS */
        .ring-wrapper {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .orbit-ring {
          border-radius: 50%;
          position: absolute;
          top: 50%; left: 50%;
          animation: spinRing linear infinite;
        }
        .orbit-ring::after {
          content: '';
          position: absolute;
          width: 10px; height: 10px;
          border-radius: 50%;
          top: -5px; left: 50%;
          transform: translateX(-50%);
        }
        .ring-1 {
          width: 420px; height: 420px;
          border: 1px solid rgba(124,58,237,0.2);
          margin-top: -210px; margin-left: -210px;
          transform: rotateX(75deg);
          animation-duration: 12s;
        }
        .ring-1::after { background: #7c3aed; box-shadow: 0 0 16px 5px #7c3aed; }
        .ring-2 {
          width: 620px; height: 620px;
          border: 1px solid rgba(67,97,238,0.15);
          margin-top: -310px; margin-left: -310px;
          transform: rotateX(75deg);
          animation-duration: 20s; animation-delay: -5s;
        }
        .ring-2::after { background: #4361ee; box-shadow: 0 0 16px 5px #4361ee; bottom: -5px; top: auto; }
        .ring-3 {
          width: 850px; height: 850px;
          border: 1px solid rgba(247,37,133,0.1);
          margin-top: -425px; margin-left: -425px;
          transform: rotateX(75deg);
          animation-duration: 32s; animation-delay: -12s;
        }
        .ring-3::after { background: #f72585; box-shadow: 0 0 16px 5px #f72585; left: -5px; top: 50%; transform: translateY(-50%); }
        @keyframes spinRing {
          from { transform: rotateX(75deg) rotateZ(0deg); }
          to   { transform: rotateX(75deg) rotateZ(360deg); }
        }

        /* GEOMETRIC SHAPES */
        .shape {
          position: absolute;
          pointer-events: none;
          animation: floatSpin linear infinite;
        }
        .cube {
          border: 2px solid rgba(255,255,255,0.12);
          background: rgba(100,60,240,0.06);
        }
        .cube-1 { width: 60px; height: 60px; top: 12%; left: 8%; animation-duration: 20s; }
        .cube-2 { width: 90px; height: 90px; bottom: 20%; left: 15%; animation-duration: 25s; animation-delay: -5s; }
        .cube-3 { width: 45px; height: 45px; top: 20%; right: 10%; animation-duration: 18s; animation-delay: -10s; }
        .cube-4 { width: 70px; height: 70px; bottom: 30%; right: 8%; animation-duration: 22s; animation-delay: -3s; }

        .tri {
          width: 0; height: 0;
          border-left: 35px solid transparent;
          border-right: 35px solid transparent;
          border-bottom: 60px solid rgba(161,80,255,0.12);
        }
        .tri-1 { top: 55%; left: 5%; animation-duration: 17s; animation-delay: -8s; }
        .tri-2 { top: 10%; right: 25%; animation-duration: 21s; animation-delay: -2s; border-bottom-width: 80px; border-left-width: 46px; border-right-width: 46px; }

        .diamond {
          width: 50px; height: 50px;
          border: 2px solid rgba(243,60,200,0.2);
          background: rgba(243,60,200,0.04);
          transform: rotate(45deg);
        }
        .diamond-1 { top: 70%; left: 30%; animation-duration: 19s; animation-delay: -6s; }
        .diamond-2 { top: 35%; right: 5%; animation-duration: 24s; animation-delay: -12s; width: 35px; height: 35px; }

        @keyframes floatSpin {
          0%   { transform: translateY(0)     rotateX(0deg)   rotateY(0deg)   rotateZ(0deg);   opacity: 0.55; }
          25%  { transform: translateY(-30px) rotateX(90deg)  rotateY(45deg)  rotateZ(45deg);  opacity: 0.9; }
          50%  { transform: translateY(-15px) rotateX(180deg) rotateY(90deg)  rotateZ(90deg);  opacity: 0.55; }
          75%  { transform: translateY(-40px) rotateX(270deg) rotateY(135deg) rotateZ(135deg); opacity: 0.85; }
          100% { transform: translateY(0)     rotateX(360deg) rotateY(180deg) rotateZ(180deg); opacity: 0.55; }
        }

        /* PARTICLES */
        .particle {
          position: absolute;
          border-radius: 50%;
          animation: particleFloat linear infinite;
          pointer-events: none;
        }
        @keyframes particleFloat {
          0%   { transform: translateY(100vh) scale(0);   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-100px) scale(1.5); opacity: 0; }
        }

        /* LOGIN CARD */
        .login-container {
          position: relative;
          z-index: 5;
          background: rgba(255,255,255,0.07);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          width: 380px;
          padding: 44px 40px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.13);
          box-shadow:
            0 40px 80px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 0 70px rgba(124,58,237,0.2);
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.5s ease;
        }
        .login-container:hover {
          transform: rotateX(7deg) rotateY(-7deg) scale(1.03) translateZ(20px);
          box-shadow: 0 60px 100px rgba(0,0,0,0.6), 0 0 80px rgba(124,58,237,0.35);
        }
        .login-container h2 {
          text-align: center;
          color: white;
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 28px;
          letter-spacing: 0.5px;
          text-shadow: 0 0 30px rgba(124,58,237,0.8);
        }
        .login-label {
          display: block;
          color: rgba(255,255,255,0.55);
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .login-container input {
          width: 100%;
          padding: 13px 16px;
          margin-bottom: 20px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          outline: none;
          font-size: 15px;
          background: rgba(255,255,255,0.08);
          color: white;
          transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
        }
        .login-container input::placeholder { color: rgba(255,255,255,0.3); }
        .login-container input:focus {
          border-color: rgba(124,58,237,0.8);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.25);
          background: rgba(255,255,255,0.12);
        }
        .login-container button {
          width: 100%;
          padding: 14px;
          margin-top: 4px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #7c3aed, #4361ee);
          color: white;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: all 0.35s ease;
          box-shadow: 0 8px 25px rgba(124,58,237,0.5);
        }
        .login-container button:hover {
          background: linear-gradient(135deg, #6d28d9, #3a0ca3);
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 15px 35px rgba(124,58,237,0.65);
        }
        .login-container button:active {
          transform: translateY(0) scale(0.98);
        }
      `}</style>

      {/* NAVBAR */}
      <nav className="navbar">
        <div className="navbar-container">
          <h1>Smart Automated Attendance System</h1>
        </div>
      </nav>

      {/* LOGIN PAGE */}
      <div className="login-page">

        {/* Ambient orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Grid floor */}
        <div className="grid-plane" />

        {/* Orbiting rings */}
        <div className="ring-wrapper">
          <div className="orbit-ring ring-1" />
          <div className="orbit-ring ring-2" />
          <div className="orbit-ring ring-3" />
        </div>

        {/* Floating shapes */}
        <div className="shape cube cube-1" />
        <div className="shape cube cube-2" />
        <div className="shape cube cube-3" />
        <div className="shape cube cube-4" />
        <div className="shape tri tri-1" />
        <div className="shape tri tri-2" />
        <div className="shape diamond diamond-1" />
        <div className="shape diamond diamond-2" />

        {/* Rising particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              boxShadow: `0 0 8px 3px ${p.color}`,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* LOGIN CARD */}
        <div className="login-container">
          <h2>🎓 Sign In</h2>
          <form onSubmit={handleSubmit}>
            <label className="login-label">Email</label>
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              onChange={handleChange}
              required
            />
            <label className="login-label">Password</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              onChange={handleChange}
              required
            />
            <button type="submit">Sign In →</button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Login;
