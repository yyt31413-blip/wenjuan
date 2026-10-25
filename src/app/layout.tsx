import type { Metadata } from 'next';
import '@fontsource-variable/noto-sans-sc';
import './globals.css';
export const metadata: Metadata = {
  title: '日常桌面使用与整理习惯问卷',
  description: '关于日常桌面使用、摆放与评价的匿名毕业设计研究。',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
