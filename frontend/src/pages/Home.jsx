import LayoffFeed from './LayoffFeed';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Hero Section */}
      <header className="bg-white border-b border-slate-200 pt-16 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
            Navigate the tech landscape with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">clarity.</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
            Real-time tracking of corporate workforce reductions. We verify the noise so job seekers can make informed career decisions and affected workers can find their next opportunity faster.
          </p>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-3xl font-black text-slate-800">1,204</div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Avg. Daily Layoffs</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-3xl font-black text-slate-800">4.2M+</div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Active Job Seekers</div>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
              <div className="text-3xl font-black text-indigo-700">100%</div>
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mt-1">Verified WARN Data</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-12">
        <LayoffFeed />
      </main>
    </div>
  );
}