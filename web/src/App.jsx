import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Hero from './components/Hero';
import Architecture from './components/Architecture';
import Layers from './components/Layers';
import Setup from './components/Setup';
import Config from './components/Config';
import Scripts from './components/Scripts';
import Troubleshooting from './components/Troubleshooting';
import Repository from './components/Repository';
import Footer from './components/Footer';
import ScrollProgress from './components/ScrollProgress';
import BackToTop from './components/BackToTop';

export default function App() {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'architecture', 'layers', 'setup', 'config', 'scripts', 'troubleshooting', 'repository'];
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
    <>
      <ScrollProgress />
      <div className="flex">
        <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
        <main className="md:ml-72 flex-1">
          <Hero />
          <Architecture />
          <Layers />
          <Setup />
          <Config />
          <Scripts />
          <Troubleshooting />
          <Repository />
          <Footer />
        </main>
      </div>
      <BackToTop />
    </>
  );
}
