import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type WhatsHappeningHereProps = {
  title: string
  docFile: string
}

const markdownComponents: Components = {
  ul: ({ ...props }) => <ul className="list-disc pl-5" {...props} />,
}

export default function WhatsHappeningHere({ title, docFile }: WhatsHappeningHereProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const loadContent = () => {
    if (content !== null || error) return
    const controller = new AbortController()
    fetch(`/docs/${docFile}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${docFile}`)
        return response.text()
      })
      .then(setContent)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(true)
      })
  }

  return (
    <Dialog onOpenChange={(open) => open && loadContent()}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          <HelpCircle data-icon="inline-start" />
          What&apos;s happening here?
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[90vw] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-secondary">
          {error && <p>Unable to load documentation.</p>}
          {!error && content === null && <p>Loading...</p>}
          {!error && content !== null && (
            <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
