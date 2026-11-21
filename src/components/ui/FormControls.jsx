export function Input({
  label,
  error,
  hint,
  requiredMark,
  id,
  className = '',
  ...rest
}) {
  const inputId = id || rest.name || `input_${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
          {requiredMark && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 min-h-[40px] transition-colors focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100'
        } disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
        {...rest}
      />
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Textarea({
  label,
  error,
  hint,
  requiredMark,
  id,
  className = '',
  ...rest
}) {
  const inputId = id || rest.name || `textarea_${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
          {requiredMark && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100'
        } disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
        {...rest}
      />
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  error,
  hint,
  requiredMark,
  id,
  className = '',
  children,
  ...rest
}) {
  const inputId = id || rest.name || `select_${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
          {requiredMark && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      <select
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 min-h-[40px] transition-colors focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100'
        } disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
