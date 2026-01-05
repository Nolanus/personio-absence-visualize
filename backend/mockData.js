export const mockTimeOffTypes = {
    data: [
        {
            type: 'TimeOffType',
            attributes: { id: 1, name: 'Paid Vacation', category: 'vacation' },
        },
        {
            type: 'TimeOffType',
            attributes: { id: 2, name: 'Sick Leave', category: 'sick_leave' },
        },
        {
            type: 'TimeOffType',
            attributes: { id: 3, name: 'Unpaid Leave', category: 'unpaid_vacation' },
        },
    ],
};

export const mockEmployees = {
    data: [
        {
            type: 'Employee',
            attributes: {
                id: { value: 101 },
                first_name: { value: 'Alice' },
                last_name: { value: 'CEO' },
                preferred_name: { value: 'Alice CEO' },
                position: { value: 'Chief Executive Officer' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Leadership' } } },

                supervisor: { value: null },
                email: { value: 'alice@example.com' },
            },
        },
        {
            type: 'Employee',
            attributes: {
                id: { value: 201 },
                first_name: { value: 'Bob' },
                last_name: { value: 'Manager' },
                preferred_name: { value: 'Bob Manager' },
                position: { value: 'Engineering Manager' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Engineering' } } },
                supervisor: { value: { attributes: { id: { value: 101 } } } },
            },
        },
        {
            type: 'Employee',
            attributes: {
                id: { value: 202 },
                first_name: { value: 'Charlie' },
                last_name: { value: 'Manager' },
                preferred_name: { value: 'Charlie Manager' },
                position: { value: 'Product Manager' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Product' } } },
                supervisor: { value: { attributes: { id: { value: 101 } } } },
            },
        },
        {
            type: 'Employee',
            attributes: {
                id: { value: 301 },
                first_name: { value: 'Dave' },
                last_name: { value: 'Developer' },
                preferred_name: { value: 'Dave Dev' },
                position: { value: 'Frontend Developer' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Engineering' } } },
                supervisor: { value: { attributes: { id: { value: 201 } } } },
            },
        },
        {
            type: 'Employee',
            attributes: {
                id: { value: 302 },
                first_name: { value: 'Eve' },
                last_name: { value: 'Developer' },
                preferred_name: { value: 'Eve Dev' },
                position: { value: 'Backend Developer' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Engineering' } } },
                supervisor: { value: { attributes: { id: { value: 201 } } } },
            },
        },
        {
            type: 'Employee',
            attributes: {
                id: { value: 303 },
                first_name: { value: 'Frank' },
                last_name: { value: 'Designer' },
                preferred_name: { value: 'Frank Design' },
                position: { value: 'UX Designer' },
                status: { value: 'active' },
                department: { value: { attributes: { name: 'Product' } } },
                supervisor: { value: { attributes: { id: { value: 202 } } } },
                email: { value: 'frank@example.com' },
            },
        },
    ],
};

// Generates mock absences based on the current date for demonstration
export const generateMockAbsences = (startDateStr) => {
    const start = new Date(startDateStr);
    const midMonth = new Date(start.getFullYear(), start.getMonth(), 15);
    const fmt = (d) => d.toISOString().split('T')[0];

    return {
        data: [
            {
                type: 'Absence',
                attributes: {
                    employee: { attributes: { id: { value: 301 } } },
                    start_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 10)),
                    end_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 12)),
                    time_off_type: { attributes: { name: 'Paid Vacation', category: 'vacation' } },
                    half_day_start: false,
                    half_day_end: false,
                },
            },
            {
                type: 'Absence',
                attributes: {
                    employee: { attributes: { id: { value: 302 } } },
                    start_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 15)),
                    end_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 15)),
                    time_off_type: { attributes: { name: 'Sick Leave', category: 'sick_leave' } },
                    half_day_start: false,
                    half_day_end: false,
                },
            },
            {
                type: 'Absence',
                attributes: {
                    employee: { attributes: { id: { value: 303 } } },
                    start_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 20)),
                    end_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 21)),
                    time_off_type: { attributes: { name: 'Paid Vacation', category: 'vacation' } },
                    half_day_start: true, // Half day start (afternoon off)
                    half_day_end: false,
                },
            },
            {
                type: 'Absence',
                attributes: {
                    employee: { attributes: { id: { value: 201 } } },
                    start_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 5)),
                    end_date: fmt(new Date(midMonth.getFullYear(), midMonth.getMonth(), 5)),
                    time_off_type: { attributes: { name: 'Paid Vacation', category: 'vacation' } },
                    half_day_start: false,
                    half_day_end: true, // Half day end (morning off)
                },
            },
        ],
    };
};
