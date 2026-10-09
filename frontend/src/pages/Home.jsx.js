import { ArrowRight, TrendingDown, Users, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-20">
        <h1 className="text-5xl font-extrabold tracking-tight mb-6">
          Navigate the tech landscape with <span className="text-indigo-600">clarity.</span>
        </h1>
        <p className="text-xl text-slate-600 mb-10">
          Real-time tracking of corporate workforce reductions. We verify the noise so job seekers can make informed career decisions and affected workers can find their next opportunity faster.
        </p>
        <Link 
          to="/feed" 
          className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
        >
          View Recent Layoffs
          <ArrowRight className="ml-2 w-5 h-5" />
        </Link>
      </div>

      {/* Live Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
          <TrendingDown className="w-10 h-10 text-rose-500 mx-auto mb-4" />
          <h3 className="text-4xl font-bold mb-2">1,204</h3>
          <p className="text-slate-500 uppercase tracking-wide text-sm font-semibold">Avg. Daily Layoffs (2026)</p>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
          <Users className="w-10 h-10 text-blue-500 mx-auto mb-4" />
          <h3 className="text-4xl font-bold mb-2">4.2M+</h3>
          <p className="text-slate-500 uppercase tracking-wide text-sm font-semibold">Active Job Seekers</p>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-4xl font-bold mb-2">100%</h3>
          <p className="text-slate-500 uppercase tracking-wide text-sm font-semibold">Verified WARN & News Data</p>
        </div>
      </div>
    </div>
  );
}