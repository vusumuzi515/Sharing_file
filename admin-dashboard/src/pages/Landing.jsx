import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicLandingContent } from '../services/monitoringApi';

const DEFAULT_CORE_VALUES = [
  'Accountability',
  'Agility',
  'Commitment',
  'Embrace Change',
  'Teamwork',
  'Tempo',
];

const DEFAULT_SLOGAN = "Africa's leading integrated business partner";
const DEFAULT_PRINCIPLE = 'Zero Tolerance';

export default function Landing() {
  const [slogan, setSlogan] = useState(DEFAULT_SLOGAN);
  const [principle, setPrinciple] = useState(DEFAULT_PRINCIPLE);
  const [coreValues, setCoreValues] = useState(DEFAULT_CORE_VALUES);

  useEffect(() => {
    let cancelled = false;
    fetchPublicLandingContent()
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.slogan === 'string' && data.slogan.trim()) setSlogan(data.slogan.trim());
        if (typeof data.principle === 'string' && data.principle.trim()) setPrinciple(data.principle.trim());
        if (Array.isArray(data.coreValues) && data.coreValues.length) {
          setCoreValues(data.coreValues.map((x) => String(x ?? '').trim()).filter(Boolean));
        }
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing-hero portal-shell-bg relative flex min-h-[100dvh] w-full flex-col text-zinc-900">
      <main className="relative z-[1] flex min-h-[100dvh] w-full flex-1 flex-col justify-between">
        <div className="flex w-full flex-1 flex-col items-center px-5 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-5 md:px-12 md:pt-10">
          <div className="flex w-full max-w-xl flex-col items-center sm:max-w-2xl">
            <section className="relative z-[2] w-full">
              <p className="mx-auto max-w-lg text-center text-[10px] font-semibold uppercase leading-relaxed tracking-[0.2em] text-zinc-800 sm:max-w-xl sm:text-[11px] sm:tracking-[0.22em]">
                {slogan}
              </p>
            </section>

            <div
              className="relative z-[2] mx-auto mt-4 h-px max-w-[10rem] bg-gradient-to-r from-transparent via-zinc-300 to-transparent sm:mt-6"
              aria-hidden
            />

            <section className="relative z-[2] mt-5 w-full sm:mt-7">
              <p className="text-center text-[10px] font-bold uppercase tracking-[0.26em] text-zinc-950 sm:text-[11px] sm:tracking-[0.3em]">
                Core Organizational Values
              </p>
              <div className="mx-auto mt-4 grid max-w-3xl grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-2.5">
                {coreValues.map((value, i) => (
                  <span
                    key={`${i}-${value}`}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300/80 bg-white/75 px-3 py-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-800 shadow-sm shadow-zinc-900/10 backdrop-blur-sm sm:min-h-[38px] sm:text-[10px]"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="relative z-[2] mt-auto flex w-full flex-col items-center px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-8 sm:pb-8 sm:pt-5 md:px-12 md:pt-6">
          <div className="flex w-full max-w-xl flex-col items-center sm:max-w-2xl">
            <p className="-translate-y-10 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-950 sm:-translate-y-12 sm:text-[11px] sm:tracking-[0.32em]">
              {principle}
            </p>
            <Link
              to="/sign-in"
              state={{ fromLanding: true }}
              className="mt-6 inline-flex min-h-[48px] w-full max-w-[280px] shrink-0 items-center justify-center rounded-full bg-zinc-950 px-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-lg shadow-zinc-900/25 outline-none ring-offset-2 ring-offset-white transition hover:bg-black focus-visible:ring-2 focus-visible:ring-zinc-900 active:scale-[0.99] sm:mt-7 sm:w-auto"
            >
              Enter Inyatsi Domain Portal
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
