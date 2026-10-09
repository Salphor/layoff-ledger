import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function CompanyDetail() {
  // MUST match the :slug parameter defined in App.jsx
  const { slug } = useParams(); 
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch using the slug parameter
    fetch(`http://localhost:3001/api/companies/${slug}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading company data:", err);
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading company details...</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">Company not found.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 my-10">
      <Link to="/" className="text-indigo-600 hover:text-indigo-800 font-semibold mb-6 inline-flex items-center gap-1">
        &larr; Back to Feed
      </Link>
      
      {/* Primary Layoff Overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 mb-2">{data.name || slug}</h1>
            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider">
              {data.industry || 'Technology'}
            </span>
          </div>
        </div>
        
        <h2 className="text-xl font-bold text-slate-800 mb-6 border-l-4 border-indigo-500 pl-4 leading-relaxed">
          {data.recentHeadline || "Recent Workforce Reduction Event"}
        </h2>
        
        {/* Supporting Evidence Articles */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Supporting Evidence & Reporting</h3>
          <div className="flex flex-col gap-2">
            {data.articles?.map((article, idx) => (
              <a 
                key={idx} 
                href={article.url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors group"
              >
                <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600">
                  {article.title}
                </span>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">
                  {article.source}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Layoff History Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Layoff History</h3>
        <div className="relative border-l-2 border-slate-100 ml-3 space-y-8 pl-6">
          {data.history?.map((event, idx) => (
            <div key={idx} className="relative">
              <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full bg-white border-2 border-indigo-600"></span>
              <div className="text-xs font-bold text-indigo-600 mb-1">{event.date}</div>
              <div className="font-bold text-slate-900">{event.affected} Employees Affected</div>
              <p className="text-sm text-slate-600 mt-1">{event.notes}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}