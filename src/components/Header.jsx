import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import reactLogo from '../assets/react.svg';

function Header() {
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const isActive = (path) => location.pathname === path;

    // Helper to handle mouse leave/enter for desktop hover effect if preferred, 
    // but click is often more accessible. Let's stick to click for consistency or hover for desktop.
    // The user didn't specify interaction model. I'll use click for robust mobile support, 
    // or maybe hover for desktop and click for mobile. 
    // Let's go with simple hover for desktop using Tailwind group-hover? 
    // Or click for everything. Click is safer.
    // Actually, standard web apps often use hover for nav dropdowns. 
    // I will implement hover for desktop using Tailwind's `group` and `group-hover`.

    return (
        <header className="bg-white shadow-md w-full fixed top-0 left-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <div className="flex-shrink-0 flex items-center">
                        <Link to="/" className="flex items-center">
                            <img src="sterlite.svg" alt="Logo" className="h-8 w-auto mr-2" />
                            <span className="font-bold text-xl text-primary-blue">OPGW Survey</span>
                        </Link>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex space-x-6 items-center">
                        <Link
                            to="/"
                            className={`text-gray-700 hover:text-primary-blue font-medium transition-colors ${isActive('/') ? 'text-primary-blue' : ''}`}
                        >
                            Home
                        </Link>

                        <Link
                            to="/docs"
                            className={`text-gray-700 hover:text-primary-blue font-medium transition-colors ${isActive('/docs') ? 'text-primary-blue' : ''}`}
                        >
                            Docs
                        </Link>

                        <Link
                            to="/convert"
                            className={`text-gray-700 hover:text-primary-blue font-medium transition-colors ${isActive('/convert') ? 'text-primary-blue' : ''}`}
                        >
                            Convert
                        </Link>


                        <Link
                            to="/live"
                            className={`text-gray-700 hover:text-primary-blue font-medium transition-colors ${isActive('/live') ? 'text-primary-blue' : ''}`}
                        >
                            View
                        </Link>
                    </nav>

                    {/* Mobile menu button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 rounded-md text-gray-700 hover:text-primary-blue focus:outline-none"
                        >
                            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Navigation */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-white border-t border-gray-100">
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        <Link
                            to="/"
                            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-blue hover:bg-gray-50"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            Home
                        </Link>
                        <Link
                            to="/docs"
                            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-blue hover:bg-gray-50"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            Docs
                        </Link>
                        <Link
                            to="/convert"
                            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-blue hover:bg-gray-50"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            Convert
                        </Link>
                        <Link
                            to="/live"
                            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-blue hover:bg-gray-50"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            View
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}

export default Header;
