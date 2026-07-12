type PageShellProps = {
  title: string;
};

export function PageShell({ title }: PageShellProps) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
    </main>
  );
}
