import Topbar from './Topbar'

export default function Layout({ children, fullBleed = false }) {
  return (
    <div className="layout">
      <Topbar />
      <main className={fullBleed ? 'main main-full' : 'main'}>{children}</main>
    </div>
  )
}
