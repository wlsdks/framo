// 켜진 Framo를 브라우저로 연다. 크롬이나 엣지가 있으면 '앱 창'(--app)으로 연다:
// 탭과 주소창이 없는 Framo만의 창이 뜨고, 작업 표시줄에도 따로 잡혀서 프로그램처럼 쓴다.
//
// 브라우저의 프로필(--user-data-dir)은 바꾸지 않는다. 발표는 브라우저 저장소(주소 http://127.0.0.1:41580)에 있어서,
// 프로필이 다르면 예전에 만든 발표가 안 보인다. 크롬이 이미 켜져 있으면 크롬이 그 창에서 앱 창을 하나 더 띄운다.
// 둘 다 없으면 기본 브라우저의 보통 탭으로 연다.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** 띄울 프로그램과 인자. 앞에서부터 해 보고, 못 띄우면 다음 것 */
type BrowserTry = [cmd: string, args: string[]]

/** 윈도우에서 크롬, 엣지가 설치되는 곳 (크롬 먼저). `start chrome`은 없을 때 오류 창을 띄워서 직접 찾는다 */
export function windowsBrowsers(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): string[] {
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => !!r)
  const chrome = roots.map((r) => join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  const edge = roots.map((r) => join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  return [...chrome, ...edge].filter((file) => exists(file))
}

/**
 * 해 볼 차례. 크롬, 엣지는 앱 창으로, 마지막은 기본 브라우저의 보통 탭.
 * 맥의 `open -n`은 크롬이 이미 켜져 있어도 인자(--app)를 넘긴다. 새로 뜬 크롬은 켜져 있는 크롬에 창을 맡기고 바로 끝난다.
 */
export function browserTries(url: string, platform: NodeJS.Platform, windows: string[] = []): BrowserTry[] {
  const app = `--app=${url}`
  if (platform === 'darwin')
    return [
      ['open', ['-n', '-a', 'Google Chrome', '--args', app]],
      ['open', ['-n', '-a', 'Microsoft Edge', '--args', app]],
      ['open', [url]],
    ]
  if (platform === 'win32') return [...windows.map((exe): BrowserTry => [exe, [app]]), ['explorer', [url]]]
  return [
    ['google-chrome', [app]],
    ['microsoft-edge', [app]],
    ['xdg-open', [url]],
  ]
}
