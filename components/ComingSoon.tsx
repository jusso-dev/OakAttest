import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          Coming soon. This route is scaffolded for milestone 1; the implementation lands in a
          later milestone per the build plan.
        </p>
      </CardContent>
    </Card>
  );
}
