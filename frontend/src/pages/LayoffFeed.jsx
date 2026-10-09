import { Link } from 'react-router-dom';
import { Calendar, Users } from 'lucide-react';

// Mock data - replace with fetch from your Express backend
const recentLayoffs = [
  { id: 1, company: "TechFlow", slug: "techflow", date: "Oct 9, 2026", headcount: 450, summary: "TechFlow announced a 15% reduction in force affecting their cloud division." },
  { id: 2, company: "BuildRight", slug: "buildright", date: "Oct 8, 2026", headcount: 120, summary: "Official WARN notice filed indicating closure of the Austin manufacturing hub." }
];

export default function LayoffFeed() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold mb-8">Recent Workforce Reductions</h2>
      <div className="space-y-4">
        {recentLayoffs.map((event) => (
          <Link 
            key={event.id} 
            to={`/company/${event.slug}`}
            className="block bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {event.company}
                </h3>
                <p className="text-slate-600 mt-2">{event.summary}</p>
              </div>
              <div className="text-right space-y-2 shrink-0 ml-6">
                <div className="flex items-center justify-end text-sm text-slate-500">
                  <Calendar className="w-4 h-4 mr-1.5" />
                  {event.date}
                </div>
                <div className="flex items-center justify-end text-sm font-medium text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                  <Users className="w-4 h-4 mr-1.5" />
                  {event.headcount} affected
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}