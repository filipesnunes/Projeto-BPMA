type NotaEdicaoLayoutProps = {
  children: React.ReactNode;
};

export default function NotaEdicaoLayout({ children }: NotaEdicaoLayoutProps) {
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12">
      {children}
    </div>
  );
}
