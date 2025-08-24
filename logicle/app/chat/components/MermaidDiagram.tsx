import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  // securityLevel: "loose",
  // theme: "forest",
  logLevel: 5,
  suppressErrorRendering: true,
})

export interface MermaidDiagramProps {
  children: string
  testId?: string
  className?: string
}
const MermaidDiagram = (props: MermaidDiagramProps) => {
  // Ref for the container div
  const containerRef = useRef<HTMLDivElement>(null)
  // Ref to store last rendered SVG string
  const svgRef = useRef<string>('')

  const uniqueId = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`).current

  const diagram_text = props.children

  // hook to handle the diagram rendering
  useEffect(() => {
    let cancelled = false
    if (!diagram_text && diagram_text.length === 0) return // create async function inside useEffect to cope with async mermaid.run
    async function renderDiagram() {
      try {
        void (await mermaid.parse(diagram_text, { suppressErrors: false }))
        const { svg } = await mermaid.render(`${uniqueId}-svg`, diagram_text)
        if (!cancelled && svg !== svgRef.current && containerRef.current) {
          containerRef.current.innerHTML = svg
          svgRef.current = svg
        }
      } catch (e: any) {
        console.log(`Error: ${e}`)
      }
    }
    renderDiagram().catch((e) => {
      console.log(`Mysterious error: ${e}`)
    })
    return () => {
      cancelled = true
    }
  }, [diagram_text, uniqueId])

  // render container (div) to hold diagram (nested SVG)
  return (
    <div
      ref={containerRef}
      className={`${props.className}`}
      id={uniqueId}
      data-testid={props.testId}
    />
  )
}

export { MermaidDiagram }
