interface Props {
  label: string;
  value: string;
  sub?: string;
  percent?: number; // 0-100，传则显示进度条
}

export function Gauge({ label, value, sub, percent }: Props) {
  return (
    <div className="gauge">
      <div className="label">{label}</div>
      <div className="value">
        {value} {sub && <small>{sub}</small>}
      </div>
      {percent !== undefined && (
        <div className="progress">
          <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      )}
    </div>
  );
}
