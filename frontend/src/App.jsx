import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import LayoffFeed from './pages/LayoffFeed';
import CompanyDetail from './pages/CompanyDetail';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/feed" element={<LayoffFeed />} />
          <Route path="/company/:slug" element={<CompanyDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;