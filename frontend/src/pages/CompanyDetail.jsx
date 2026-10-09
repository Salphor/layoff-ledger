import { useState } from 'react';
import { ChevronDown, Calendar, MapPin, Building, Info } from 'lucide-react';

export default function CompanyDetail() {
  // Mock data - replace with fetch based on the 'slug' URL parameter
  const company = { name: "TechFlow" };
  const events = [
    { id: 1, date: "October 9, 2026", headcount: 450, reason: "Restructuring of cloud services division to align with Q4 profitability goals.", locations: ["San Francisco, CA", "Remote"], isLatest: true },
    { id: 2, date: "March 12, 2024", headcount: 200, reason: "Post-pandemic market correction and over-hiring adjustment.", locations: ["Austin, TX"], isLatest: false },
  ];

  const [openTab, setOpenTab] = useState(null);

  const latestEvent = events.find(e => e.isLatest);
  const historicalEvents = events.filter(e => !e.isLatest);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-extrabold mb-10">{company.name} Layoff History</h1>

      {/* Latest Event - Fully Elaborated */}
      {latestEvent && (
        <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm p-8 mb-10">
          <div className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold uppercase tracking-wider rounded-full mb-6">
            Most Recent Event
          </div>
          
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <p className="text-sm text-slate-500 flex items-center mb-1"><Calendar className="w-4 h-4 mr-2" /> Announced</p>
              <p className="font-semibold text-lg">{latestEvent.date}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 flex items-center mb-1"><Users className="w-4 h-4 mr-2" /> Employees Affected</p>
              <p className="font-semibold text-lg text-rose-600">{latestEvent.headcount}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center"><Info className="w-4 h-4 mr-2 text-slate-400" /> Stated Reason</h4>
            <p className="text-slate-600 leading-relaxed">{latestEvent.reason}</p>
          </div>
        </div>
      )}

      {/* Historical Events - Expandable Accordions */}
      {historicalEvents.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4">Past Layoff Events</h3>
          <div className="space-y-3">
            {historicalEvents.map((event) => (
              <div key={event.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button 
                  onClick={() => setOpenTab(openTab === event.id ? null : event.id)}
                  className="w-full px-6 py-4 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex space-x-6">
                    <span className="font-semibold text-slate-900">{event.date}</span>
                    <span className="text-slate-500">{event.headcount} affected</span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openTab === event.id ? 'rotate-180' : ''}`} />
                </button>
                
                {openTab === event.id && (
                  <div className="p-6 border-t border-slate-200">
                    <p className="text-slate-600"><strong className="text-slate-900">Reason:</strong> {event.reason}</p>
                    <p className="text-slate-600 mt-2"><strong className="text-slate-900">Locations:</strong> {event.locations.join(", ")}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}