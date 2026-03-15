import React from 'react';
import './LandingPage.css';
import { Stethoscope, Zap, GitBranch, BrainCircuit, FileText } from 'lucide-react';

interface LandingPageProps {
  onLaunch: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  return (
    <div className="landing-wrapper dark-mode">
      {/* Ambient Background */}
      <div className="bg-decoration">
        <div className="alt-orb orb-1"></div>
        <div className="alt-orb orb-2"></div>
        <div className="alt-orb orb-3"></div>
      </div>

      {/* Navigation */}
      <nav className="glass-nav">
        <div className="nav-container">
          <div className="landing-logo">
            <Stethoscope className="icon-accent" size={24} />
            <span>Phos AI</span>
          </div>
          <div className="landing-nav-links">
            <a href="#features">Features</a>
            <button onClick={onLaunch} className="landing-btn-primary">Launch App</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="nav-container">
          <div className="landing-hero-content fade-up visible">
            <span className="landing-badge">AI-Powered Interaction Safety</span>
            <h1 className="hero-gradient">
              See what your <br /> prescriptions <span className="text-accent">don't tell you.</span>
            </h1>
            <p className="hero-sub">
              Multi-hop biological cascade detection powered by Phos Intelligence. 
              Identify hidden risks before they become clinical symptoms.
            </p>
            <div className="hero-btns">
              <button onClick={onLaunch} className="landing-btn-primary large">
                Start Analysis <Zap size={20} />
              </button>
              <a href="#features" className="landing-btn-secondary large">Learn More</a>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="nav-container">
          <h2 className="landing-section-title">Precision Intelligence</h2>
          <div className="landing-feature-grid">
            <div className="landing-feature-card glass-panel fade-up visible">
              <GitBranch className="icon-accent" size={32} />
              <h3>Cascade Detection</h3>
              <p>Detect indirect interactions through enzyme pathways and shared biological targets.</p>
            </div>
            <div className="landing-feature-card glass-panel fade-up visible">
              <BrainCircuit className="icon-accent" size={32} />
              <h3>AI Synthesis</h3>
              <p>State-of-the-art LLMs synthesize complex graph data into actionable clinical summaries.</p>
            </div>
            <div className="landing-feature-card glass-panel fade-up visible">
              <FileText className="icon-accent" size={32} />
              <h3>Clinical Reports</h3>
              <p>Generate professional-grade PDF reports ready for physician consultation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="nav-container">
          <div className="footer-content">
            <div className="landing-logo">
              <Stethoscope className="icon-accent" size={20} />
              <span>Phos AI</span>
            </div>
            <p>&copy; 2026 Phos AI Healthcare. For clinical decision support only.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
