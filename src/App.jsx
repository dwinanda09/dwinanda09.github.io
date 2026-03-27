import React, { useState, useEffect } from 'react';
import { 
  Github, 
  Linkedin, 
  Mail, 
  MapPin, 
  Terminal, 
  Database, 
  Server, 
  Briefcase, 
  GraduationCap, 
  ChevronRight,
  Code2,
  Cpu,
  Globe,
  Layout
} from 'lucide-react';

const App = () => {
  const [activeSection, setActiveSection] = useState('home');

  // Smooth scrolling handler
  const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  // Update active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['home', 'about', 'skills', 'experience', 'projects'];
      const scrollPosition = window.scrollY + 100;

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section);
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-cyan-900 selection:text-cyan-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-slate-950/80 backdrop-blur-md z-50 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0 font-bold text-xl text-white tracking-wider cursor-pointer" onClick={() => scrollTo('home')}>
              DNS<span className="text-cyan-500">.</span>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-8">
                {['Home', 'About', 'Skills', 'Experience', 'Projects'].map((item) => (
                  <button
                    key={item}
                    onClick={() => scrollTo(item.toLowerCase())}
                    className={`${
                      activeSection === item.toLowerCase()
                        ? 'text-cyan-400 font-medium'
                        : 'text-slate-400 hover:text-white'
                    } transition-colors duration-200 px-3 py-2 rounded-md text-sm`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        {/* Hero Section */}
        <section id="home" className="py-20 md:py-32 flex flex-col justify-center min-h-[80vh]">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-900/30 text-cyan-400 text-sm font-medium mb-6 w-max border border-cyan-800/50">
            <Terminal className="w-4 h-4 mr-2" />
            Backend Software Engineer
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6">
            Hi, I'm <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Dwi Nanda.</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 max-w-3xl leading-relaxed mb-10">
            I design and build distributed systems that are efficient, resilient, and scalable. I focus on creating backend architectures that can gracefully handle real-world load.
          </p>
          
          <div className="flex flex-wrap gap-4 mb-12">
            <a href="mailto:dwnnd09@gmail.com" className="flex items-center px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors duration-200">
              <Mail className="w-5 h-5 mr-2" />
              Contact Me
            </a>
            <a href="https://github.com/dwinanda09" target="_blank" rel="noreferrer" className="flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors duration-200 border border-slate-700">
              <Github className="w-5 h-5 mr-2" />
              GitHub
            </a>
            <a href="https://www.linkedin.com/in/dwi-nanda-3ba842103/" target="_blank" rel="noreferrer" className="flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors duration-200 border border-slate-700">
              <Linkedin className="w-5 h-5 mr-2" />
              LinkedIn
            </a>
          </div>

          <div className="flex items-center text-slate-500 text-sm">
            <MapPin className="w-4 h-4 mr-1" />
            Jakarta, Indonesia
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="py-20 border-t border-slate-800/50">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center">
            <Code2 className="w-8 h-8 mr-3 text-cyan-500" />
            About Me
          </h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 md:p-10 leading-relaxed text-lg text-slate-300 shadow-xl">
            <p>
              I'm a backend software engineer who thrives in designing and building distributed systems that are efficient, resilient, and scalable. I focus on creating backend architectures that can gracefully handle real-world load, with strong attention to service reliability, observability, and monitoring.
            </p>
            <p className="mt-4">
              My approach emphasizes proactive mitigation planning and robust fallback strategies, ensuring systems can recover or roll back seamlessly when things go wrong. I'm driven to build solutions that not only perform at scale today but also remain adaptable and future-proof as products and teams continue to grow.
            </p>
          </div>
        </section>

        {/* Skills Section */}
        <section id="skills" className="py-20 border-t border-slate-800/50">
          <h2 className="text-3xl font-bold text-white mb-12 flex items-center">
            <Cpu className="w-8 h-8 mr-3 text-cyan-500" />
            Technical Arsenal
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Languages", icon: <Terminal className="w-5 h-5 text-cyan-400" />, skills: ["Go", "JavaScript", "TypeScript", "PHP", "Python"] },
              { title: "Frameworks", icon: <Layout className="w-5 h-5 text-blue-400" />, skills: ["Gin", "Echo", "Nest.JS", "ExpressJS", "Laravel", "Django-rest"] },
              { title: "Databases", icon: <Database className="w-5 h-5 text-emerald-400" />, skills: ["PostgreSQL", "MySQL", "MongoDB", "ArangoDB", "Redis"] },
              { title: "Tools & Platforms", icon: <Server className="w-5 h-5 text-purple-400" />, skills: ["GCP", "AWS", "GitHub Actions", "New Relic", "Datadog", "Docker"] },
              { title: "Protocols & Brokers", icon: <Globe className="w-5 h-5 text-orange-400" />, skills: ["REST", "gRPC", "GraphQL", "NSQ", "RabbitMQ", "Kafka", "AWS SQS"] },
              { title: "Prompt Engineering", icon: <Code2 className="w-5 h-5 text-pink-400" />, skills: ["Claude code", "gemini-cli"] },
            ].map((category, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-cyan-500/30 transition-colors duration-300">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-slate-950 rounded-lg mr-3">
                    {category.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white">{category.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {category.skills.map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-slate-800 text-slate-300 rounded-md text-sm font-medium border border-slate-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Experience Section */}
        <section id="experience" className="py-20 border-t border-slate-800/50">
          <h2 className="text-3xl font-bold text-white mb-12 flex items-center">
            <Briefcase className="w-8 h-8 mr-3 text-cyan-500" />
            Work Experience
          </h2>
          
          <div className="space-y-12">
            {[
              {
                company: "PT. ARCHOR TEKNOLOGI DIGITAL (QOALA.ID)",
                industry: "Insure-tech",
                role: "Software Engineer II",
                period: "Dec 2025 - Present",
                highlights: [
                  "Designed and scaled a multi-tenant onboarding platform for insurance operations, enabling management of customers, banks, brokers, and partner companies within a unified system.",
                  "Architected and implemented complex onboarding workflows for bank and insurance product data, normalizing heterogeneous business rules and regulatory constraints across partners while preserving backward compatibility.",
                  "Built a high-throughput bulk policy ingestion system for bank partners integrated with Zurich Insurance Group, reducing manual onboarding processes and significantly improving operational efficiency.",
                  "Improved system security by introducing service-to-service authentication (Basic Auth) across internal microservices, reducing unauthorized access risk and strengthening internal API protection.",
                  "Collaborated with product, compliance, and business teams to translate regulatory requirements into scalable backend systems using Go (Golang)."
                ]
              },
              {
                company: "PT. PAKAR DIGITAL GLOBAL (PAPER.ID)",
                industry: "SaaS e-invoicing",
                role: "Software Engineer Backend - Middle",
                period: "May 2024 - Oct 2025",
                highlights: [
                  "Bank Transfer Automation: Orchestrated integration using Zapier-based automation, achieving cost-efficient reconciliation.",
                  "AI-Driven Reconciliation (J&T Cargo): Delivered an AI-enhanced transaction framework boosting accuracy and reducing manual intervention by 60%.",
                  "OCR Invoice System V1 & V2: Spearheaded Paper's OCR pipeline handling 1,000+ daily emails with 99% success rate. Re-architected V2 with non-volatile configs managing 1,500+ files/hr via FCFS queues.",
                  "Dynamic Approval Workflow System: Engineered a configurable, multi-layer approval engine for Accounts Payable (AP) workflows.",
                  "Operational Automation Suite: Automated cross-departmental administrative workflows including data inquiries, bug triage, and log auditing."
                ]
              },
              {
                company: "PT. SAYAKAYA LAHIR BATIN",
                industry: "Investment",
                role: "Software Engineer Backend",
                period: "March 2024 - April 2024",
                highlights: [
                  "Redesign the secure architecture of user login sessions to enhance protection against unauthorized access.",
                  "Streamline the back-office administrative workflow for financial reporting.",
                  "Optimize back-office API performance, reducing latency from request timeouts to an average response time of 0.5 seconds."
                ]
              },
              {
                company: "PT. INDOPASIFIK TEKNOLOGI MEDIKA INDONESIA (LIFEPACK.ID)",
                industry: "Online Pharmacy",
                role: "Software Engineer Backend - Middle",
                period: "May 2023 - Feb 2024",
                highlights: [
                  "Develop and maintain the OpenAPI for TetaShop's B2B services, ensuring seamless integration and scalability.",
                  "Implement OTP order service integration using WhatsApp and Slack webhooks for secure and efficient authentication.",
                  "Optimize overall service response times, reducing latency from a 30-second threshold to a maximum of 3 seconds per request."
                ]
              },
              {
                company: "PT. TOKOPEDIA",
                industry: "E-commerce",
                role: "Software Engineer Backend",
                period: "Aug 2021 - Mar 2023",
                highlights: [
                  "Led digital product visibility initiatives in Digital Bills & Top-Up.",
                  "Ensured a secure SDLC as a Security Champion within the Digital Growth team.",
                  "Developed and implemented load testing capabilities using Hammerflux and Hammertime.",
                  "Improved minimum code and test coverage to 98% for each repository managed by the team."
                ]
              },
              {
                company: "PT. KATALISATOR ASA INDONESIA (TJETAK)",
                industry: "SaaS Digital Printing",
                role: "Software Engineer Backend",
                period: "April 2020 - July 2021",
                highlights: [
                  "Developed a robust pricing engine for the main marketplace service and integrated it with estimator tools.",
                  "Conducted research, performed code refactoring, and improved market price performance by 60% in Q1-2021.",
                  "Designed and implemented core calculation libraries for Tjetak's three main product categories."
                ]
              }
            ].map((job, idx) => (
              <div key={idx} className="relative pl-8 md:pl-0">
                {/* Timeline line for mobile */}
                <div className="md:hidden absolute left-0 top-0 bottom-0 w-px bg-slate-800"></div>
                {/* Timeline dot for mobile */}
                <div className="md:hidden absolute left-[-4px] top-2 w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>

                <div className="md:grid md:grid-cols-4 md:gap-8 items-start group">
                  <div className="mb-4 md:mb-0 md:col-span-1 pt-1 md:text-right flex flex-col items-start md:items-end">
                    <span className="text-sm font-semibold text-cyan-400 uppercase tracking-wider bg-cyan-950/40 px-3 py-1 rounded-full border border-cyan-900/50">
                      {job.period}
                    </span>
                  </div>
                  <div className="md:col-span-3 bg-slate-900/40 p-6 md:p-8 rounded-2xl border border-slate-800 hover:border-cyan-500/30 transition-all duration-300 relative">
                    {/* Timeline connection for desktop */}
                    <div className="hidden md:block absolute left-[-2rem] top-8 w-8 h-px bg-slate-800 group-hover:bg-cyan-900 transition-colors"></div>
                    <div className="hidden md:block absolute left-[-2.25rem] top-[1.85rem] w-2 h-2 rounded-full bg-slate-700 group-hover:bg-cyan-500 transition-colors shadow-[0_0_10px_rgba(6,182,212,0)] group-hover:shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>

                    <h3 className="text-xl font-bold text-white mb-1">{job.role}</h3>
                    <div className="text-slate-400 font-medium mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm md:text-base">
                      <span className="text-blue-400">{job.company}</span>
                      <span className="hidden sm:inline text-slate-600">•</span>
                      <span>{job.industry}</span>
                    </div>
                    <ul className="space-y-3">
                      {job.highlights.map((point, i) => (
                        <li key={i} className="flex items-start text-slate-300 leading-relaxed text-sm md:text-base">
                          <ChevronRight className="w-5 h-5 text-cyan-600 mr-2 flex-shrink-0 mt-0.5" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Projects Section */}
        <section id="projects" className="py-20 border-t border-slate-800/50">
          <h2 className="text-3xl font-bold text-white mb-12 flex items-center">
            <Code2 className="w-8 h-8 mr-3 text-cyan-500" />
            Notable Projects
          </h2>
          
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-1 rounded-2xl border border-slate-800">
            <div className="bg-slate-900 p-8 rounded-xl h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Biller Partner Integration</h3>
                <span className="px-4 py-1.5 bg-blue-900/30 text-blue-400 text-sm font-semibold rounded-full border border-blue-800/50">
                  RTS.ID x TOKOPEDIA
                </span>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2.5 mr-4 flex-shrink-0"></div>
                  <p className="text-slate-300 leading-relaxed">
                    Led a key project integrating RTS.id with Tokopedia, streamlining Telkomsel's airtime biller partner aggregation to improve operational efficiency and service reliability.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2.5 mr-4 flex-shrink-0"></div>
                  <p className="text-slate-300 leading-relaxed">
                    Architected and developed a secure middleware solution to enable seamless communication between RTS.id and Tokopedia, ensuring smooth data exchange with encryption and decryption mechanisms, adhering to Tokopedia's complex security standards to minimize transaction failures.
                  </p>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2.5 mr-4 flex-shrink-0"></div>
                  <p className="text-slate-300 leading-relaxed">
                    Released and maintained the integration solution, continuously optimizing transaction processing workflows, enhancing system performance, and improving overall transaction success rates for Telkomsel's airtime billing services.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Education Section */}
        <section className="py-20 border-t border-slate-800/50">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center">
            <GraduationCap className="w-8 h-8 mr-3 text-cyan-500" />
            Education
          </h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 flex flex-col md:flex-row md:items-center justify-between hover:border-cyan-500/30 transition-colors">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Universitas Indonesia</h3>
              <p className="text-slate-400">Sarjana Ilmu Komputer, Fakultas Ilmu Komputer</p>
            </div>
            <div className="mt-4 md:mt-0 text-cyan-400 font-medium bg-cyan-950/40 px-4 py-2 rounded-lg border border-cyan-900/50 inline-block">
              2015 - 2020 (Graduated)
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-10 mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-500 text-sm mb-4 md:mb-0">
            © {new Date().getFullYear()} Dwi Nanda Susanto. All rights reserved.
          </p>
          <div className="flex space-x-6">
            <a href="https://github.com/dwinanda09" className="text-slate-500 hover:text-white transition-colors">
              <span className="sr-only">GitHub</span>
              <Github className="w-5 h-5" />
            </a>
            <a href="https://www.linkedin.com/in/dwi-nanda-3ba842103/" className="text-slate-500 hover:text-white transition-colors">
              <span className="sr-only">LinkedIn</span>
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="mailto:dwnnd09@gmail.com" className="text-slate-500 hover:text-white transition-colors">
              <span className="sr-only">Email</span>
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
