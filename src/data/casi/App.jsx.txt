import { useState, useEffect, useMemo, useRef } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import casi from './data/casi/index.js'

const WORDS_PER_MINUTE = 190

const estimateSeconds = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (words / WORDS_PER_MINUTE) * 60
}

const formatTime = (seconds) => {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Spezza un testo lungo in chunk sicuri per TTS (max ~600 chars, a fine frase)
const chunkText = (text, maxLen = 600) => {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)

  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length <= maxLen) {
      current = current ? current + ' ' + sentence : sentence
    } else {
      if (current) chunks.push(current)
      if (sentence.length > maxLen) {
        // frase troppo lunga: taglia a forza
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen))
        }
        current = ''
      } else {
        current = sentence
      }
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export default function App() {
  const [view, setView] = useState('home')
  const [selectedCase, setSelectedCase] = useState(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [chapterElapsed, setChapterElapsed] = useState(0)

  const playingRef = useRef(false)

  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    setChapterElapsed(0)
  }, [chapterIndex, selectedCase])

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setChapterElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [isPlaying, chapterIndex])

  const totalCaseSeconds = useMemo(() => {
    if (!selectedCase) return 0
    return selectedCase.chapters.reduce((sum, ch) => sum + estimateSeconds(ch.text), 0)
  }, [selectedCase])

  const elapsedBaseSeconds = useMemo(() => {
    if (!selectedCase) return 0
    return selectedCase.chapters
      .slice(0, chapterIndex)
      .reduce((sum, ch) => sum + estimateSeconds(ch.text), 0)
  }, [selectedCase, chapterIndex])

  const totalElapsed = Math.min(elapsedBaseSeconds + chapterElapsed, totalCaseSeconds)

  const openCase = (caso) => {
    setSelectedCase(caso)
    setChapterIndex(0)
    setIsPlaying(false)
    setView('player')
  }

  const backToHome = async () => {
    playingRef.current = false
    setIsPlaying(false)
    try { await TextToSpeech.stop() } catch {}
    setView('home')
  }

  const speakChapter = async (caso, index) => {
    if (!caso || index >= caso.chapters.length) {
      setIsPlaying(false)
      return
    }

    const fullText = caso.chapters[index].text
    const chunks = chunkText(fullText, 650)

    try {
      // Assicurati che non ci sia altro in coda
      try { await TextToSpeech.stop() } catch {}

      for (let i = 0; i < chunks.length; i++) {
        if (!playingRef.current) break

        await TextToSpeech.speak({
          text: chunks[i],
          lang: 'it-IT',
          rate: 0.95,
          pitch: 1.0,
          volume: 1.0,
        })
      }
    } catch (e) {
      console.log('TTS error', e)
      setIsPlaying(false)
      return
    }

    if (playingRef.current) {
      const next = index + 1
      if (next < caso.chapters.length) {
        setChapterIndex(next)
        speakChapter(caso, next)
      } else {
        setIsPlaying(false)
      }
    }
  }

  const togglePlay = async () => {
    if (isPlaying) {
      playingRef.current = false
      setIsPlaying(false)
      try { await TextToSpeech.stop() } catch {}
    } else {
      playingRef.current = true
      setIsPlaying(true)
      speakChapter(selectedCase, chapterIndex)
    }
  }

  const skip = async (direction) => {
    try { await TextToSpeech.stop() } catch {}
    const next = chapterIndex + direction
    if (next < 0 || next >= selectedCase.chapters.length) return
    setChapterIndex(next)
    if (playingRef.current) {
      speakChapter(selectedCase, next)
    }
  }

  if (view === 'player' && selectedCase) {
    const chapter = selectedCase.chapters[chapterIndex]
    return (
      <div className="app">
        <div className="player">
          <div className="player-top">
            <button className="back-btn" onClick={backToHome}>&larr; Elenco casi</button>
            <div className="player-case-title">{selectedCase.title}</div>
            <div className="chapter-title">{chapter.title}</div>
            <div className="chapter-indicator">
              Capitolo {chapterIndex + 1} di {selectedCase.chapters.length}
            </div>
          </div>

          <div>
            <div className="time-readout">
              {formatTime(totalElapsed)} / {formatTime(totalCaseSeconds)}
            </div>
            <div className="controls">
              <button className="skip-btn" onClick={() => skip(-1)}>&laquo;</button>
              <button className="play-btn" onClick={togglePlay}>
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <button className="skip-btn" onClick={() => skip(1)}>&raquo;</button>
            </div>
            <div className="progress-dots">
              {selectedCase.chapters.map((_, i) => (
                <span key={i} className={i === chapterIndex ? 'active' : ''} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <h1>CANTA STORIE</h1>
        <p>cronache dell'ignoto</p>
      </div>
      <div className="list">
        {casi.length === 0 && (
          <div className="empty-state">Nessun caso disponibile ancora.</div>
        )}
        {casi.map((caso) => (
          <div className="case-card" key={caso.id} onClick={() => openCase(caso)}>
            <h2>{caso.title}</h2>
            <p>{caso.teaser}</p>
            <span className="chapters-count">{caso.chapters.length} capitoli</span>
          </div>
        ))}
      </div>
    </div>
  )
}
