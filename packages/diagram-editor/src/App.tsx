import { useEffect } from 'react';
import { AppView } from './AppView';
import { retireOfflineDelivery } from './retireOfflineDelivery';
import { useEditorController } from './useEditorController';

export {
  composeRenderGraph,
  edgeForCompatibility,
  projectCanonicalGraph,
} from './editorProjection';

export default function App() {
  useEffect(() => {
    void retireOfflineDelivery();
  }, []);
  return <AppView controller={useEditorController()} />;
}
