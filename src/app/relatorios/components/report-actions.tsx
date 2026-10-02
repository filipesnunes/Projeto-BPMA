"use client";

export function ReportActions() {
  return (
    <div className="btn-group print:hidden">
      <button type="button" className="btn-primary" onClick={async () => {
        await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
        window.print();
      }}>
        Emitir PDF
      </button>
    </div>
  );
}
