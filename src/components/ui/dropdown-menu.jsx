import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function DropdownMenu({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside both trigger and content
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(e.target);
      const isOutsideContent = contentRef.current && !contentRef.current.contains(e.target);
      
      if (isOutsideTrigger && isOutsideContent) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on scroll to prevent misaligned dropdown
  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };
    
    if (isOpen) {
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  return (
    <div className="relative">
      {typeof children === 'function' 
        ? children({ isOpen, setIsOpen, triggerRef, contentRef }) 
        : children}
    </div>
  );
}

export function DropdownMenuTrigger({ children, onClick, asChild, triggerRef, ...props }) {
  return (
    <button ref={triggerRef} onClick={onClick} {...props}>
      {children}
    </button>
  );
}

// Portal-based dropdown content - renders to document.body to escape overflow containers
export function DropdownMenuPortal({ children }) {
  return createPortal(children, document.body);
}

export function DropdownMenuContent({ 
  children, 
  isOpen, 
  align = 'end', 
  side = 'bottom',
  sideOffset = 4,
  triggerRef,
  contentRef,
  className = '' 
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      let top = rect.bottom + scrollY + sideOffset;
      let left = rect.left + scrollX;
      
      // Adjust for side positioning
      if (side === 'left') {
        left = rect.left + scrollX - 176; // 176px = w-44 (11rem)
        top = rect.top + scrollY;
      } else if (side === 'top') {
        top = rect.top + scrollY - sideOffset;
      }
      
      // Adjust for alignment
      if (align === 'end') {
        left = rect.right + scrollX - 176; // Right-align the dropdown
      } else if (align === 'center') {
        left = rect.left + scrollX + (rect.width / 2) - 88; // Center
      }
      
      // Prevent dropdown from going off-screen (right edge)
      const viewportWidth = window.innerWidth;
      if (left + 176 > viewportWidth) {
        left = viewportWidth - 176 - 8; // 8px padding from edge
      }
      if (left < 8) {
        left = 8;
      }
      
      // Prevent dropdown from going off-screen (bottom edge)
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 200; // Approximate dropdown height
      if (top + estimatedHeight > viewportHeight + scrollY) {
        // Flip to top
        top = rect.top + scrollY - estimatedHeight - sideOffset;
      }
      
      setPosition({ top, left });
    }
  }, [isOpen, triggerRef, align, side, sideOffset]);

  if (!isOpen) return null;
  
  return (
    <div 
      ref={contentRef}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 9999,
      }}
      className={`w-44 bg-white border border-gray-100 shadow-xl rounded-lg py-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, onClick, className = '', disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-gray-100 my-1" />;
}
