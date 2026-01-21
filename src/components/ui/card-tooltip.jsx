import * as Tooltip from '@radix-ui/react-tooltip';

/**
 * CardTooltip - Portal-based tooltip that renders above all elements including sticky headers/columns
 * Uses Radix UI Tooltip with Portal for proper z-index handling
 */
export function CardTooltip({ children, content, side = 'bottom', align = 'center', delayDuration = 200 }) {
    return (
        <Tooltip.Provider delayDuration={delayDuration}>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    {children}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content
                        side={side}
                        align={align}
                        sideOffset={8}
                        collisionPadding={10}
                        className="z-[9999] px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl min-w-[200px] max-w-[300px] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                    >
                        {content}
                        <Tooltip.Arrow className="fill-gray-800" />
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        </Tooltip.Provider>
    );
}

export default CardTooltip;
