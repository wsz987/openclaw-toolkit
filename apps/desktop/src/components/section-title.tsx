export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-title">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
