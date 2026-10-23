import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title: "知序 · AI 个人情报库", description: "让信息相连，让洞察生长。收集、研读与追踪 AI 主题进展。", icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>;}
