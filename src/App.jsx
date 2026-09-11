import { useState, useEffect, useRef } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import casi from './data/casi/index.js'

export default function App() {
  const [view, setView] = useState('home')
  const [selectedCase, setSelectedCase] = useState(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const playingRef = useRef(false)

  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])

  const openCase = (caso) => {
    setSelectedCase(caso)
    setChapterIndex(0)
    setIsPlaying(false)
    setView('player')
  }

  const backToHome = async () => {
    setIsPlaying(false)
    await TextToSpeech.stop()
    setView('home')
  }

  const speakChapter = async (caso, index) => {
    if (!caso || index >= caso.chapters.length) {
      setIsPlaying(false)
      return
    }
    try {
      await TextToSpeech.speak({
        text: caso.chapters[index].text,
        lang: 'it-IT',
        rate: 0.88,
        pitch: 0.92,
        volume: 1.0,
      })
    } catch (e) {
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

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      TextToSpeech.stop()
    } else {
      setIsPlaying(true)
      speakChapter(selectedCase, chapterIndex)
    }
  }

  const skip = async (direction) => {
    await TextToSpeech.stop()
    const next = chapterIndex + direction
    if (next < 0 || next >= selectedCase.chapters.length) return
    setChapterIndex(next)
    if (isPlaying) {
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
