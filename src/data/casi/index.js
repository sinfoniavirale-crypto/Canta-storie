const modules = import.meta.glob('./*.js', { eager: true })

const casi = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

export default casi
