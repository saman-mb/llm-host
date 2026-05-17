import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Hero from './components/Hero';
import Architecture from './components/Architecture';
import Layers from './components/Layers';
import Config from './components/Config';
import Scripts from './components/Scripts';
import Setup from './components/Setup';
import Commits from './components/Commits';
import Files from './components/Files';
import Troubleshooting from './components/Troubleshooting';
import Footer from './components/Footer';

export default function App() {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'architecture', 'layers', 'config', 'scripts', 'setup', 'commits', 'files', 'troubleshooting'];
      for (const id of sections.reverse()) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 150) {
          setActiveSection(id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="flex">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
      <main className="md:ml-72 flex-1">
        <Hero />
        <Architecture />
        <Layers />
        <Config />
        <Scripts />
        <Setup />
        <Commits />
        <Files />
        <Troubleshooting />
        <Footer />
      </main>
    </div>
  );
}
