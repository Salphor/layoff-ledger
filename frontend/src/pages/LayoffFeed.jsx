import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function LayoffFeed() {
  const [layoffs, setLayoffs] = useState([]);

  useEffect(() => {
    // 1. THIS IS WHERE YOU FIX THE 2-ITEM LIMIT
    // Replace this with your actual local Express server endpoint
    fetch('http://localhost:3001/api/layoffs')
      .then(res => res.json())
      .then(data => setLayoffs(data))
      .catch(err => {
         console.error("Failed to fetch from DB:", err);
         // Fallback mock data so you can see the design
         setLayoffs([
           { id: 'techflow', company: 'TechFlow', date: 'Oct 9, 2026', affected: 450, summary: 'TechFlow announced a 15% reduction in force affecting their cloud division.' },
           { id: 'buildright', company: 'BuildRight', date: 'Oct 8, 2026', affected: 120, summary: 'Official WARN notice filed indicating closure of the Austin manufacturing hub.' }
         ]);
      });
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Recent Workforce Reductions</h2>
      <div className="flex flex-col gap-4">
        {layoffs.map((layoff) => (
          <Link 
            key={layoff.id} 
            to={`/company/${layoff.id}`}
            className="block bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                {layoff.company}
              </h3>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-500">{layoff.date}</div>
                <div className="text-sm font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md inline-block mt-1">
                  {layoff.affected} affected
                </div>
              </div>
            </div>
            <p className="text-slate-600">{layoff.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}