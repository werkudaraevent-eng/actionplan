# Modal Department Selector - Clean Form Layout

## Problem
The ActionPlanModal initially had a large teal "Select Department" box at the top of the modal that looked disconnected and messy. Users preferred a clean, uniform form layout where the Department field is a standard input like all other fields.

## Solution
Removed the styled teal box and integrated the Department selector as a standard form field in the grid, making it the first field (top-left position).

## Changes Made

### ActionPlanModal.jsx

**Removed: Top Teal Box**
```jsx
// DELETED - This teal box was removed
{!editData && hasMultipleDepartments && !staffMode && (
  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
    <label className="block text-sm font-medium text-teal-900 mb-2">
      Select Department
    </label>
    <select ... />
    <p className="text-xs text-teal-700 mt-1">
      You have access to {availableDepartments.length} departments
    </p>
  </div>
)}
```

**Added: Standard Form Field**
```jsx
{/* Row 1: Department & Month */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Department {!editData && <span className="text-red-500">*</span>}
    </label>
    <select
      value={formData.department_code}
      onChange={(e) => handleDepartmentChange(e.target.value)}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
        editData || (!hasMultipleDepartments && !staffMode) ? 'bg-gray-50 text-gray-600' : ''
      }`}
      required={!editData}
      disabled={editData || (!hasMultipleDepartments && !staffMode)}
    >
      <option value="">Select Department</option>
      {availableDepartments.map((d) => (
        <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
      ))}
    </select>
    {editData && (
      <p className="text-xs text-gray-500 mt-1">Department cannot be changed</p>
    )}
    {!editData && !hasMultipleDepartments && (
      <p className="text-xs text-gray-500 mt-1">Your assigned department</p>
    )}
  </div>
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
    <select ... />
  </div>
</div>
```

## How It Works

### Department Field Behavior

**1. Creating New Plan - Multiple Departments:**
- Field is **enabled** (white background)
- Shows dropdown with all accessible departments
- Required field (red asterisk)
- User must select before submitting

**2. Creating New Plan - Single Department:**
- Field is **disabled** (gray background)
- Pre-filled with user's only department
- Shows helper text: "Your assigned department"
- Cannot be changed (no need to)

**3. Editing Existing Plan:**
- Field is **disabled** (gray background)
- Shows the plan's current department
- Shows helper text: "Department cannot be changed"
- Locked to prevent accidental changes

**4. Staff Mode:**
- Field is **disabled** (gray background)
- Pre-filled from department context
- Staff cannot change department

### Form Layout

**Row 1: Department & Month**
```
┌──────────────────┬──────────────────┐
│ Department *     │ Month            │
│ [BAS - Business] │ [Jan ▼]          │
│ Your assigned... │                  │
└──────────────────┴──────────────────┘
```

**Row 2: Category & Area Focus**
```
┌──────────────────┬──────────────────┐
│ Category         │ Area to be Focus │
│ [Select... ▼]    │ [Select... ▼]    │
└──────────────────┴──────────────────┘
```

All fields use consistent styling:
- Same border color (`border-gray-300`)
- Same border radius (`rounded-lg`)
- Same padding (`px-3 py-2`)
- Same focus ring (`focus:ring-2 focus:ring-teal-500`)
- Disabled fields use gray background (`bg-gray-50 text-gray-600`)

## User Experience

### Before (Disconnected)
```
┌─────────────────────────────────────┐
│ 🎨 Select Department (Teal Box)     │
│ [Dropdown: BAS - Business...]       │
│ You have access to 2 departments    │
└─────────────────────────────────────┘
                ↓ Gap
Form Fields:
┌──────────────┬──────────────┐
│ Month        │ Category     │
│ [Dropdown]   │ [Dropdown]   │
└──────────────┴──────────────┘
```

### After (Clean & Uniform)
```
Form Fields:
┌──────────────────┬──────────────────┐
│ Department *     │ Month            │
│ [BAS - Business] │ [Jan ▼]          │
└──────────────────┴──────────────────┘
┌──────────────────┬──────────────────┐
│ Category         │ Area to be Focus │
│ [Select... ▼]    │ [Select... ▼]    │
└──────────────────┴──────────────────┘
```

## Testing Scenarios

### Test Case 1: Admin Creating New Plan
**Setup:** Admin user with access to all departments  
**Expected:**
- Department field visible in Row 1 (enabled, white background)
- Can select any department from dropdown
- Required field with red asterisk
- Month field next to it in Row 1
- Form submission includes selected `department_code`

### Test Case 2: Leader with Multiple Departments Creating Plan
**Setup:** Leader with Primary: BAS, Additional: [BID]  
**Expected:**
- Department field visible in Row 1 (enabled, white background)
- Dropdown shows only BAS and BID
- Can select either department
- Required field with red asterisk
- Form submission includes selected `department_code`

### Test Case 3: Leader with Single Department Creating Plan
**Setup:** Leader with only Primary: BAS  
**Expected:**
- Department field visible in Row 1 (disabled, gray background)
- Pre-filled with "BAS - Business Administration"
- Shows helper text: "Your assigned department"
- Cannot change selection
- Form submission includes "BAS" as `department_code`

### Test Case 4: Editing Existing Plan
**Setup:** Any user editing an existing action plan  
**Expected:**
- Department field visible in Row 1 (disabled, gray background)
- Shows the plan's current department
- Helper text: "Department cannot be changed"
- Cannot change selection
- Form submission preserves original `department_code`

### Test Case 5: Staff Mode
**Setup:** Staff user creating plan  
**Expected:**
- Department field visible in Row 1 (disabled, gray background)
- Pre-filled with staff's department from context
- Helper text: "Your assigned department"
- Cannot change selection
- Form submission includes correct `department_code`

## Benefits

1. **Clean, Uniform Layout**: Department field looks like all other form fields
2. **No Visual Disconnect**: No separate styled box at the top
3. **Consistent Styling**: Same border, padding, and focus states as other inputs
4. **Clear Hierarchy**: Department is first field (top-left), establishing context
5. **Better UX**: Users see department selection in natural form flow
6. **Simpler Design**: No special styling or conditional rendering for top box
7. **Professional Appearance**: Standard form layout matches industry conventions

## Edge Cases Handled

1. **No department selected**: Required validation on new plans
2. **Single department user**: Field disabled and pre-filled, shows helper text
3. **Editing mode**: Field disabled to prevent changes, shows helper text
4. **Staff mode**: Field disabled, pre-filled from context
5. **Multiple departments**: Field enabled, shows all accessible options
6. **Admin creating**: Field enabled, shows all departments

## Related Files
- `src/components/ActionPlanModal.jsx` - Main modal component
- `src/context/DepartmentContext.jsx` - Department context provider
- `src/hooks/useDepartmentUsers.js` - Fetches users by department

## Design Principles

1. **Form Consistency**: All input fields should look and behave similarly
2. **Visual Hierarchy**: Important fields (like Department) should be prominent but not disconnected
3. **Progressive Disclosure**: Show/hide complexity based on user's access level
4. **Clear Feedback**: Use disabled states and helper text to communicate constraints
5. **Standard Patterns**: Follow conventional form layouts for familiarity

## Future Enhancements
- Consider adding department icon/badge next to the label
- Add tooltip explaining why field is disabled (for single-department users)
- Consider color-coding department options by type (if applicable)
- Add keyboard shortcuts for quick department selection (for power users)
