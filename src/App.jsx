import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Convert from './pages/Convert';
import Docs from './pages/Docs';
import Download from './pages/Download';
import Live from './pages/Live';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <Header />

        {/* Main Content Area - Add top padding to account for fixed header */}
        <main className="pt-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/convert" element={<Convert />} />

            {/* New Simplified Routes */}
            <Route path="/download" element={<Download />} />
            <Route path="/live" element={<Live />} />
            <Route path="/live/:lotId/:fileName" element={<Live />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
