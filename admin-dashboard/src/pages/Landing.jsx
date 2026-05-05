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
      <main className="relative z-[1] flex min-h-[100dvh] w-full flex-1 flex-col">
        <div className="flex w-full flex-1 flex-col items-center px-5 pt-10 pb-8 sm:px-8 sm:pt-14 sm:pb-10 md:px-12">
          <div className="flex w-full max-w-xl flex-col items-center sm:max-w-2xl">
            <section className="relative z-[2] w-full">
              <p className="mx-auto max-w-lg text-center text-[11px] font-semibold uppercase leading-relaxed tracking-[0.22em] text-zinc-800 sm:max-w-xl sm:text-xs sm:tracking-[0.24em]">
                {slogan}
              </p>
            </section>

            <div
              className="relative z-[2] mx-auto mt-8 h-px max-w-[12rem] bg-gradient-to-r from-transparent via-zinc-300 to-transparent sm:mt-10"
              aria-hidden
            />

            <section className="relative z-[2] mt-8 w-full sm:mt-10">
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                Core Organizational Values
              </p>
              <div className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-3 sm:gap-3">
                {coreValues.map((value, i) => (
                  <span
                    key={`${i}-${value}`}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300/80 bg-white/75 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-800 shadow-sm shadow-zinc-900/10 backdrop-blur-sm sm:min-h-[42px] sm:text-[11px]"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="relative z-[2] mt-auto flex w-full flex-col items-center px-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-10 sm:px-8 sm:pb-14 sm:pt-12 md:px-12 md:pt-14">
          <div className="flex w-full max-w-xl flex-col items-center sm:max-w-2xl">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
              {principle}
            </p>
            <Link
              to="/dashboard"
              className="mt-12 inline-flex min-h-[52px] w-full max-w-[280px] shrink-0 items-center justify-center rounded-full bg-zinc-950 px-12 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow-lg shadow-zinc-900/25 outline-none ring-offset-2 ring-offset-white transition hover:bg-black focus-visible:ring-2 focus-visible:ring-zinc-900 active:scale-[0.99] sm:mt-16 sm:w-auto md:mt-20"
            >
              Enter file portal
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
