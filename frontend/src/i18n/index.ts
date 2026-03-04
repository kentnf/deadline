import React, { createContext, useContext, useState } from 'react'
import { en } from './en'

type Lang = 'zh' | 'en'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'zh',
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('app-language')
    return stored === 'en' ? 'en' : 'zh'
  })

  const setLang = (next: Lang) => {
    setLangState(next)
    localStorage.setItem('app-language', next)
  }

  return React.createElement(LanguageContext.Provider, { value: { lang, setLang } }, children)
}

export function useT() {
  const { lang } = useContext(LanguageContext)
  return (key: string): string => {
    if (lang === 'zh') return key
    return (en as Record<string, string>)[key] ?? key
  }
}

export function useLang() {
  return useContext(LanguageContext)
}
