export default function PlaceholderPage({ title, description }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <p className="mt-2 text-slate-600">{description}</p>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        Content for this section will be implemented here.
      </div>
    </div>
  );
}
