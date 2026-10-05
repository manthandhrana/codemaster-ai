import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Page } from '../components/ui';

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={
          <Link to="/">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
        }
      >
        The page you are looking for does not exist.
      </EmptyState>
    </Page>
  );
}
