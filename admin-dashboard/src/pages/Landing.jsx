import { Link } from 'react-router-dom';

const VALUES = [
  'Quality, Control, Discipline',
  'Teamwork',
  'Commitment & Accountability',
  'Embrace Change',
  'Honesty & Integrity',
  'Excellence in Performance',
];

export default function Landing() {
  return (
    <div className="portal-shell-bg relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Inyatsi Construction
        </h1>
        <p className="mt-4 text-xl font-semibold text-[#0e5b45] sm:text-2xl">
          Quality, Control, Discipline
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Our pledge to doing it right the first time
        </p>

        <div className="mt-12 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Our Values
          </p>
          <ul className="flex flex-wrap justify-center gap-2">
            {VALUES.map((value) => (
              <li
                key={value}
                className="rounded-lg border border-white/60 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-sm"
              >
                {value}
              </li>
            ))}
          </ul>
        </div>

        <Link
          to="/dashboard"
          className="mt-12 inline-flex min-h-[52px] items-center justify-center rounded-xl bg-white px-10 font-semibold text-[#0e5b45] shadow-lg transition-all hover:bg-emerald-50 hover:shadow-xl active:scale-[0.98]"
        >
          Enter File Portal
        </Link>
      </div>
    </div>
  );
}
