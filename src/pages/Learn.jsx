import React from 'react';
import {
    BookOpen,
    FileText,
    MapPin,
    Globe,
    Layers,
    Zap,
    Link as LinkIcon,
    Database,
    ArrowRight,
    HelpCircle
} from 'lucide-react';

const LearnSection = ({ title, icon: Icon, children, colorClass = "text-primary-blue" }) => (
    <section className="mb-16 scroll-mt-24">
        <div className="flex items-center gap-3 mb-6">
            <div className={`p-3 rounded-2xl bg-white shadow-sm border border-gray-100 ${colorClass}`}>
                <Icon size={28} />
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
        </div>
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-300">
            {children}
        </div>
    </section>
);

const FeatureCard = ({ title, description, icon: Icon }) => (
    <div className="flex flex-col gap-3 p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-lg transition-all duration-300 group">
        <div className="text-primary-blue group-hover:scale-110 transition-transform duration-300">
            <Icon size={24} />
        </div>
        <h3 className="font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
);

const InfoBox = ({ children, title }) => (
    <div className="mt-6 bg-blue-50 border-l-4 border-primary-blue p-4 rounded-r-xl">
        {title && <h4 className="font-bold text-primary-blue mb-1">{title}</h4>}
        <div className="text-sm text-blue-900">{children}</div>
    </div>
);

const Learn = () => {
    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Hero Section */}
            <div className="bg-gradient-to-br from-primary-blue to-blue-700 text-white py-20 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full mb-6 text-blue-100 text-sm font-medium border border-white/20">
                        <BookOpen size={16} />
                        <span>Learning Center</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
                        Understanding the <span className="text-blue-200">OPGW Survey</span> Ecosystem
                    </h1>
                    <p className="text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
                        A comprehensive guide for beginners to master survey data processing, coordinate systems, and GIS integration for OPGW (Optical Ground Wire) infrastructure.
                    </p>
                    <div className="mt-8 p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 max-w-lg mx-auto text-left flex items-start gap-4">
                        <div className="bg-white/20 p-2 rounded-lg mt-1 flex-shrink-0">
                            <HelpCircle size={20} className="text-blue-200" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white mb-1">What is OPGW?</p>
                            <p className="text-xs text-blue-100/80 leading-relaxed">
                                Optical Ground Wire (OPGW) is a dual-functioning cable used in electrical power lines. It protects the line from lightning while providing a high-speed telecommunications link.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 -mt-10">
                {/* Quick Navigation */}
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 mb-16">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Table of Contents</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {['What is CSV?', 'Coordinates & Standards', 'QGIS Explained', 'The Bridge Concept', 'Format Choices'].map((item) => (
                            <a
                                key={item}
                                href={`#${item.toLowerCase().replace(/\s+/g, '-').replace('?', '')}`}
                                className="flex items-center gap-2 p-3 text-gray-600 hover:text-primary-blue hover:bg-blue-50 rounded-xl transition-all font-medium"
                            >
                                <ArrowRight size={14} />
                                {item}
                            </a>
                        ))}
                    </div>
                </div>

                {/* Section 1: What is CSV? */}
                <div id="what-is-csv">
                    <LearnSection title="What is CSV?" icon={FileText}>
                        <div className="grid md:grid-cols-2 gap-10">
                            <div className="space-y-4">
                                <p className="text-lg text-gray-600 leading-relaxed">
                                    CSV stands for <strong>Comma Separated Values</strong>. It is the simplest possible way to store tabular data (like an Excel sheet) in a plain text file.
                                </p>
                                <p className="text-gray-600">
                                    Unlike Excel (.xlsx) files, which contain complex formatting, formulas, and multiple sheets, a CSV file is "raw". It contains only text, with each row separated by a new line and each cell separated by a comma.
                                </p>
                                <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 shadow-inner">
                                    <div className="text-gray-500 mb-2">// How a CSV looks inside</div>
                                    tower_id, latitude, longitude, type<br />
                                    T1, 10.7845, 78.4321, Suspension<br />
                                    T2, 10.7856, 78.4335, Tension
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <FeatureCard
                                    icon={Globe}
                                    title="Universal Compatibility"
                                    description="Every data software on earth can read CSV files, from Excel to complex Map systems."
                                />
                                <FeatureCard
                                    icon={Database}
                                    title="Lightweight"
                                    description="CSV files are 10x smaller than Excel files because they don't store formatting or styling."
                                />
                            </div>
                        </div>
                    </LearnSection>
                </div>

                {/* Section 2: Coordinates & Standards */}
                <div id="coordinates--standards">
                    <LearnSection title="Coordinates & Standards" icon={MapPin} colorClass="text-emerald-600">
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-xl font-bold mb-4 text-gray-800">Standard Columns for Lat/Long</h3>
                                <p className="text-gray-600 mb-6">
                                    To map your data correctly, the app looks for specific column names. Using standard names ensures the "magic" happens automatically.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                        <div className="font-bold text-emerald-700 mb-1">Preferred</div>
                                        <code className="text-sm bg-white px-2 py-1 rounded">latitude</code>, <code className="text-sm bg-white px-2 py-1 rounded">longitude</code>
                                    </div>
                                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                        <div className="font-bold text-blue-700 mb-1">Common</div>
                                        <code className="text-sm bg-white px-2 py-1 rounded">lat</code>, <code className="text-sm bg-white px-2 py-1 rounded">long</code>, <code className="text-sm bg-white px-2 py-1 rounded">lng</code>
                                    </div>
                                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                        <div className="font-bold text-purple-700 mb-1">GIS Style</div>
                                        <code className="text-sm bg-white px-2 py-1 rounded">y_coord</code>, <code className="text-sm bg-white px-2 py-1 rounded">x_coord</code>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            <div>
                                <h3 className="text-xl font-bold mb-4 text-gray-800">Supported Formats for Conversion</h3>
                                <div className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 font-bold text-gray-700">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            Decimal Degrees (DD)
                                        </div>
                                        <p className="text-sm text-gray-600 ml-4">
                                            The most common computer-friendly format. Example: <code className="bg-gray-100 px-1">10.784543</code>.
                                            This app supports up to 8 decimal places for millimeter precision.
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 font-bold text-gray-700">
                                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                            Degrees Minutes Seconds (DMS)
                                        </div>
                                        <p className="text-sm text-gray-600 ml-4">
                                            Traditional surveyor format. Example: <code className="bg-gray-100 px-1">10°47'04.3"N</code>.
                                            The app automatically converts this back into decimals for the map to display.
                                        </p>
                                    </div>
                                </div>
                                <InfoBox title="Excel Conversion Constraints">
                                    <p className="mb-2 uppercase text-[10px] font-bold tracking-widest text-emerald-600">Important for Uploads</p>
                                    <ul className="list-disc ml-4 space-y-1 text-xs">
                                        <li>Latitude must be in <strong>Column K</strong></li>
                                        <li>Longitude must be in <strong>Column L</strong></li>
                                        <li>Data should start from <strong>Row 6</strong></li>
                                        <li>Excel files must be in <code>.xlsx</code> format</li>
                                    </ul>
                                </InfoBox>
                                <InfoBox title="Why does format matter?">
                                    Maps "live" in decimals. When you upload a file with DMS, our conversion engine parses the degrees, minutes, and seconds, applies the math, and turns them into modern GIS coordinates.
                                </InfoBox>
                            </div>
                        </div>
                    </LearnSection>
                </div>

                {/* Section 3: What is QGIS? */}
                <div id="qgis-explained">
                    <LearnSection title="What is QGIS?" icon={Layers} colorClass="text-orange-600">
                        <div className="flex flex-col md:flex-row gap-10 items-center">
                            <div className="flex-1 space-y-4">
                                <p className="text-lg text-gray-600 leading-relaxed">
                                    <strong>QGIS</strong> is the world's most popular open-source <strong>Geographic Information System</strong>.
                                </p>
                                <p className="text-gray-600">
                                    Think of it as "Photoshop for Maps". While our web app is great for viewing and quick edits, QGIS is where serious mapping, engineering, and print-ready reports happen.
                                </p>
                                <ul className="space-y-3">
                                    {[
                                        'Create professional engineering maps',
                                        'Perform complex terrain analysis',
                                        'Export files for Google Earth (KML/KMZ)',
                                        'Add layers like Satellite imagery, roads, and rivers'
                                    ].map((li) => (
                                        <li key={li} className="flex gap-2 text-gray-600 text-sm">
                                            <Zap size={16} className="text-orange-500 flex-shrink-0" />
                                            {li}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="w-full md:w-72 aspect-square bg-orange-50 rounded-3xl flex items-center justify-center p-8 border border-orange-100">
                                <img src="/docs/qgis_logo.png" alt="QGIS Logo" className="max-w-full h-auto drop-shadow-xl" onError={(e) => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/9/91/QGIS_logo_new.svg'} />
                            </div>
                        </div>
                    </LearnSection>
                </div>

                {/* Section 4: The Bridge Concept */}
                <div id="the-bridge-concept">
                    <LearnSection title="The Bridge Concept" icon={LinkIcon} colorClass="text-pink-600">
                        <div className="space-y-6">
                            <p className="text-lg text-gray-600 text-center max-w-2xl mx-auto mb-10">
                                This app was built as a <strong>vital bridge</strong> between manual Excel surveys and professional GIS software.
                            </p>
                            <div className="grid md:grid-cols-3 gap-6 relative">
                                {/* Connector Lines (Visual) */}
                                <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-dashed bg-gray-200 -z-10"></div>

                                <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm text-center">
                                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Database size={24} />
                                    </div>
                                    <h4 className="font-bold mb-2">Excel Input</h4>
                                    <p className="text-xs text-gray-500">Messy, scattered, and non-spatial survey sheets.</p>
                                </div>

                                <div className="p-6 bg-primary-blue text-white rounded-2xl shadow-xl text-center scale-110">
                                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Zap size={24} />
                                    </div>
                                    <h4 className="font-bold mb-2">This App</h4>
                                    <p className="text-xs text-blue-100">Clean, standardizing, processing, and visualizing data.</p>
                                </div>

                                <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm text-center">
                                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Layers size={24} />
                                    </div>
                                    <h4 className="font-bold mb-2">QGIS Output</h4>
                                    <p className="text-xs text-gray-500">Ready-to-use professional engineering maps.</p>
                                </div>
                            </div>
                            <InfoBox title="Why bridge them?">
                                Manual data entry in QGIS is incredibly slow and prone to errors. Likewise, viewing maps in Excel is impossible. This app automates the translation so you can focus on the survey, not the data formatting.
                            </InfoBox>
                        </div>
                    </LearnSection>
                </div>

                {/* Section 5: Why CSV? */}
                <div id="format-choices">
                    <LearnSection title="Why CSV Format?" icon={HelpCircle} colorClass="text-indigo-600">
                        <div className="prose prose-indigo max-w-none text-gray-600">
                            <p>
                                You might wonder why we don't just use Excel files directly. The choice of CSV is intentional and technical:
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 not-prose mt-6">
                                <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <h5 className="font-bold text-gray-900 mb-2">Web Optimization</h5>
                                    <p className="text-sm">Web browsers can read CSV files 100x faster than Excel files. This allows us to load thousands of tower points in milliseconds.</p>
                                </div>
                                <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <h5 className="font-bold text-gray-900 mb-2">No "Lock-in"</h5>
                                    <p className="text-sm">Excel is a proprietary format. CSV is open. You will always be able to open your data, even 20 years from now, on any device.</p>
                                </div>
                                <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <h5 className="font-bold text-gray-900 mb-2">Developer Friendly</h5>
                                    <p className="text-sm">CSV structure is predictable. This allows our app to automatically calculate KM lengths and tower counts without errors.</p>
                                </div>
                                <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <h5 className="font-bold text-gray-900 mb-2">Searchability</h5>
                                    <p className="text-sm">Large projects have thousands of files. Searching through text (CSV) is instant, whereas searching through hundreds of Excel files would take minutes.</p>
                                </div>
                            </div>
                        </div>
                    </LearnSection>
                </div>

                {/* Final CTA */}
                <div className="bg-white rounded-3xl p-10 shadow-2xl border border-blue-100 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to start your first survey?</h2>
                    <p className="text-gray-600 mb-8 max-w-lg mx-auto">
                        Now that you understand the basics, head over to the Convert page to transform your Excel data.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a href="/convert" className="px-8 py-3 bg-primary-blue text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
                            Go to Convert Page
                        </a>
                        <a href="/docs" className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                            Read Full Docs
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Learn;
