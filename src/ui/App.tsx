// import "../../wdyr/wdyr.js";
import './App.css'
import { ConfirmationRenderer } from './lib/components/confirmation'
import { ToastRenderer } from './lib/components/toast'
import { subscribeToGenericEvents } from './global/genericEventListener'
import { TaskMonitor } from './global/TaskMonitor'
import { subscribeToTasks } from './global/taskSubscription'
import { CustomTitleBar } from './components/CustomTitleBar'
import { EditorApp } from './editor/EditorApp'

subscribeToTasks()
subscribeToGenericEvents()

function App() {
  return (
    <>
      <ToastRenderer />
      <ConfirmationRenderer />

      <div className="flex h-full flex-col">
        <CustomTitleBar />
        <div className="min-h-0 flex-1">
          <EditorApp />
        </div>
      </div>
      <TaskMonitor />
    </>
  )
}

export default App
