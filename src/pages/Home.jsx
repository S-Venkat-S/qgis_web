import React from 'react';
import reactLogo from '../assets/react.svg';

function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 to-gray-100 p-4">

            {/* Logos Section */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-16 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
                <div className="flex flex-col items-center group">
                    <div className="w-40 h-40 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden border-4 border-gray-100 group-hover:border-primary-blue transition-colors duration-300">
                        <img
                            src="https://placehold.co/200x200/f59e0b/white?text=TANTRANSCO"
                            alt="TANTRANSCO Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>

                <div className="hidden md:block h-24 w-px bg-gray-300 transform rotate-12"></div>

                <div className="flex flex-col items-center group">
                    <div className="w-40 h-40 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden border-4 border-gray-100 group-hover:border-primary-blue transition-colors duration-300">
                        <img
                            src="https://placehold.co/200x200/0066b3/white?text=STERLITE"
                            alt="STERLITE Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
            </div>

            {/* Project Title */}
            <div className="text-center max-w-2xl px-4 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
                <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
                    OPGW Project
                </h1>

                <div className="inline-block px-4 py-1 bg-blue-100 text-primary-blue rounded-full text-sm font-semibold tracking-wide mb-6 uppercase">
                    LoA No. 999 dt.29.11.2019
                </div>

                <p className="text-xl md:text-2xl text-gray-600 leading-relaxed font-light">
                    Design, Engineering, Manufacture, Supply, Erection under live line condition, Testing & Commissioning of 48 Fibres Optical Power Ground Wire (OPGW) with accessories including earthing & Annual Maintenance Contract - under Reliable communication scheme with partial Funding from Power System Development (PSDF)
                    <br className="hidden md:block" />
                </p>
            </div>
        </div>
    );
}

export default Home;
