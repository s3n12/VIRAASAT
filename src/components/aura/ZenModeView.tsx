import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Clock, Pause, Play, X } from 'lucide-react';
import { auraApi } from '../../lib/auraApi';
import { updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type { AuraStory } from '../../types/aura';
import { EditorialImage } from './EditorialPrimitives';

export function ZenModeView() {
  const { navigate } = useAuraRouter();
  const [stories, setStories] = useState<AuraStory[]>([]);
  const [index, setIndex] = useState(0);
  const [showClock, setShowClock] = useState(true);
  const [showCaption, setShowCaption] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [timeString, setTimeString] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    updateDocumentSeo('Zen Mode — AURA', 'Distraction-free fullscreen visual gallery.');
    auraApi.getStories().then((res) => setStories(res.stories)).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeString(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const goNext = useCallback(() => {
    if (stories.length === 0) return;
    setIndex((prev) => (prev + 1) % stories.length);
  }, [stories.length]);

  const goPrev = useCallback(() => {
    if (stories.length === 0) return;
    setIndex((prev) => (prev - 1 + stories.length) % stories.length);
  }, [stories.length]);

  useEffect(() => {
    if (!autoAdvance || stories.length <= 1) return;
    const timer = setInterval(goNext, 9000);
    return () => clearInterval(timer);
  }, [autoAdvance, stories.length, goNext]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/discover');
      } else if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoAdvance((v) => !v);
      } else if (e.key.toLowerCase() === 'c') {
        setShowClock((v) => !v);
      } else if (e.key.toLowerCase() === 'i') {
        setShowCaption((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, navigate]);

  const current = stories[index] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F0D0C] text-[#FAF7F2] select-none overflow-hidden"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = touchStartX.current - (e.changedTouches[0]?.clientX ?? touchStartX.current);
        touchStartX.current = null;
        if (Math.abs(delta) > 45) {
          if (delta > 0) goNext();
          else goPrev();
        }
      }}
    >
      {current && (
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <EditorialImage
              src={current.coverImage}
              alt={current.title}
              priority
              className="w-full h-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/35"
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Minimal Top Floating Controls */}
      <div className="relative z-10 flex items-center justify-between px-6 sm:px-10 pt-7">
        {showClock ? (
          <div className="font-mono text-2xl sm:text-3xl tracking-wider text-[#FAF7F2]/90 tabular-nums">
            {timeString}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowClock((v) => !v)}
            aria-label="Toggle clock"
            className="px-3 py-2 text-xs bg-black/40 backdrop-blur-md border border-white/15 rounded-lg text-[#FAF7F2]/85 hover:bg-black/70 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            {showClock ? 'Hide clock' : 'Show clock'}
          </button>

          <button
            type="button"
            onClick={() => setAutoAdvance((v) => !v)}
            aria-label={autoAdvance ? 'Pause slideshow' : 'Play slideshow'}
            className="p-2 bg-black/40 backdrop-blur-md border border-white/15 rounded-lg text-[#FAF7F2]/85 hover:bg-black/70 transition-colors"
          >
            {autoAdvance ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => navigate('/discover')}
            aria-label="Exit Zen Mode"
            className="px-3.5 py-2 text-xs bg-black/50 backdrop-blur-md border border-white/20 rounded-lg text-[#FAF7F2] hover:bg-[#FAF7F2] hover:text-[#1C1917] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Exit Zen
          </button>
        </div>
      </div>

      {/* Bottom Whisper Caption & Navigation */}
      <div className="absolute bottom-0 inset-x-0 z-10 px-6 sm:px-10 pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        {showCaption && current ? (
          <div className="max-w-xl space-y-1.5">
            <p className="text-xs uppercase tracking-[0.2em] text-[#EAE4DA]/75 tabular-nums">
              {String(index + 1).padStart(2, '0')} / {String(stories.length).padStart(2, '0')} · {current.creator.name}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/story/${current.slug}`)}
              className="text-left font-serif text-2xl sm:text-3xl text-[#FAF7F2] hover:text-[#EAE4DA] transition-colors"
            >
              {current.title}
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photograph"
            className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-[#FAF7F2] hover:bg-[#FAF7F2] hover:text-[#1C1917] transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photograph"
            className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-[#FAF7F2] hover:bg-[#FAF7F2] hover:text-[#1C1917] transition-colors flex items-center justify-center"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
