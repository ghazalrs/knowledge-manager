function App() {

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b px-6 py-5">
        <span className="text-sm font-semibold tracking-tight">Knowledge Manager</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <section className="w-full max-w-lg text-center" aria-labelledby="welcome-title">
          <h1 id="welcome-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome to Knowledge Manager
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Your workspace for capturing ideas and organizing what you learn.
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
