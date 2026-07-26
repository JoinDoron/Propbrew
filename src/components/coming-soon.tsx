import { EmptyState } from '@/components/ui';

/**
 * Placeholder for a scaffolded-but-unbuilt surface. It still sits behind the
 * page's capability guard, so reaching it at all proves the route is authorised;
 * it names the requirement ids the real screen will satisfy.
 */
export function ComingSoon({ requirementIds }: { requirementIds: readonly string[] }) {
  return (
    <div className="max-w-[1200px] mx-auto">
      <EmptyState
        title="Scaffolded — screen lands next"
        description={`This route is wired and access-controlled. The Phase-1 screen for ${requirementIds.join(', ')} is built in the next pass.`}
      />
    </div>
  );
}
