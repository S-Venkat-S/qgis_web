import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import docContent from '../docs/guide.md?raw';

function AccordionItem({ title, children, isOpen, onClick }) {
    return (
        <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
            <button
                className="w-full px-6 py-4 text-left flex justify-between items-center focus:outline-none bg-white hover:bg-gray-50 transition-colors"
                onClick={onClick}
            >
                <span className="font-semibold text-gray-800 text-lg">{title}</span>
                {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-primary-blue flex-shrink-0 ml-4" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                )}
            </button>

            <div
                className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="px-6 pb-6 pt-2 border-t border-gray-100 bg-gray-50/50">
                    <div className="prose prose-blue prose-sm max-w-none text-gray-600">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Docs() {
    const [openIndex, setOpenIndex] = useState(null);

    // Helper to create URL-friendly slugs
    const slugify = (text) => {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    };

    // Parse Markdown into Sections and Questions
    const parsedContent = useMemo(() => {
        const lines = docContent.split('\n');
        const sections = [];

        let currentSection = { title: "Introduction", questions: [] }; // Default section
        let currentQuestion = null;
        let isHeaderProcessed = false;

        lines.forEach((line) => {
            const trimmedLine = line.trim();

            // Skip main title
            if (trimmedLine.startsWith('# ') && !isHeaderProcessed) {
                isHeaderProcessed = true;
                return;
            }

            // Check for Section Header (##)
            if (trimmedLine.startsWith('## ')) {
                if (currentQuestion) {
                    currentSection.questions.push(currentQuestion);
                    currentQuestion = null;
                }
                if (currentSection.questions.length > 0 || currentSection.intro) {
                    sections.push(currentSection);
                }
                currentSection = {
                    title: trimmedLine.substring(3).trim(),
                    questions: []
                };
                return;
            }

            // Check for Question Header (###)
            if (trimmedLine.startsWith('### ')) {
                if (currentQuestion) {
                    currentSection.questions.push(currentQuestion);
                }
                const title = trimmedLine.substring(4).replaceAll('*', '').trim();
                currentQuestion = {
                    title: title,
                    slug: slugify(title),
                    answer: ''
                };
                return;
            }

            // Add content
            if (currentQuestion) {
                currentQuestion.answer += line + '\n';
            } else {
                if (!currentSection.intro) currentSection.intro = '';
                currentSection.intro += line + '\n';
            }
        });

        if (currentQuestion) {
            currentSection.questions.push(currentQuestion);
        }
        if (currentSection.questions.length > 0 || currentSection.intro) {
            sections.push(currentSection);
        }

        return sections;
    }, []);

    // Handle initial hash on load
    React.useEffect(() => {
        const hash = window.location.hash.substring(1);
        if (hash && parsedContent.length > 0) {
            parsedContent.forEach((section, sIdx) => {
                section.questions.forEach((q, qIdx) => {
                    if (q.slug === hash) {
                        const uniqueId = `${sIdx}-${qIdx}`;
                        setOpenIndex(uniqueId);
                        // Small delay to allow rendering before scroll
                        setTimeout(() => {
                            const element = document.getElementById(hash);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 100);
                    }
                });
            });
        }
    }, [parsedContent]);

    const handleToggle = (globalIndex, slug) => {
        const isOpen = openIndex === globalIndex;
        setOpenIndex(isOpen ? null : globalIndex);

        if (!isOpen && slug) {
            // Update URL without scrolling
            window.history.pushState(null, null, `#${slug}`);
        }
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex justify-center p-4 md:p-8">
            <div className="w-full max-w-4xl">
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Documentation</h1>
                    <p className="text-lg text-gray-600">User guides, tutorials, and technical reference.</p>
                </div>

                {parsedContent.map((section, sIdx) => (
                    <div key={sIdx} className="mb-8">
                        {/* Section Title */}
                        {section.title !== "Introduction" && (
                            <h2 className="text-xl font-bold text-gray-800 mb-4 px-2 border-l-4 border-primary-blue">
                                {section.title}
                            </h2>
                        )}

                        {/* Questions */}
                        <div className="space-y-4">
                            {section.questions.map((q, qIdx) => {
                                const uniqueId = `${sIdx}-${qIdx}`;
                                return (
                                    <div id={q.slug} key={uniqueId} className="scroll-mt-24">
                                        <AccordionItem
                                            title={
                                                <div className="flex items-center group">
                                                    <span className="group-hover:text-primary-blue transition-colors">{q.title}</span>
                                                    <span className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 text-sm font-normal">#</span>
                                                </div>
                                            }
                                            isOpen={openIndex === uniqueId}
                                            onClick={() => handleToggle(uniqueId, q.slug)}
                                        >
                                            <ReactMarkdown
                                                components={{
                                                    img: ({ node, ...props }) => (
                                                        <img
                                                            {...props}
                                                            className="max-w-full h-auto rounded-lg shadow-md my-4 border border-gray-100"
                                                            loading="lazy"
                                                        />
                                                    ),
                                                    a: ({ node, ...props }) => (
                                                        <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary-blue hover:underline" />
                                                    )
                                                }}
                                            >
                                                {q.answer}
                                            </ReactMarkdown>
                                        </AccordionItem>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div className="text-center mt-12 text-sm text-gray-500">
                    Can't find what you're looking for? <a href="#" className="text-primary-blue hover:underline">Contact Support</a>
                </div>
            </div>
        </div>
    );
}

export default Docs;
