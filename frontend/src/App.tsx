import { AuthGate } from './auth/AuthGate'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { DatasetPage } from './pages/DatasetPage'
import { LabelPage } from './pages/LabelPage'
import { ProjectPage } from './pages/ProjectPage'
import { Link, paths, useRoute } from './router'

export default function App() {
  const route = useRoute()
  return (
    <AuthGate>
      {(session) => {
        switch (route.name) {
          case 'dashboard':
            return <DashboardPage session={session} />
          case 'project':
            return <ProjectPage key={route.id} session={session} id={route.id} />
          case 'dataset':
            return <DatasetPage key={route.id} session={session} id={route.id} />
          case 'label':
            return <LabelPage imageId={route.imageId} />
          case 'not-found':
            return (
              <AppShell session={session} crumbs={[{ label: 'Not found' }]}>
                <div className="empty">
                  <p>This page does not exist.</p>
                  <Link to={paths.dashboard()}>Go to projects</Link>
                </div>
              </AppShell>
            )
        }
      }}
    </AuthGate>
  )
}
