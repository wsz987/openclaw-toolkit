type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function Card({ title, description, children }: Props) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}
