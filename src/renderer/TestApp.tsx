import React from 'react'

const TestApp: React.FC = () => {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#f0f0f0', 
      minHeight: '100vh',
      fontSize: '24px',
      color: '#333'
    }}>
      <h1>🎉 React is Working!</h1>
      <p>Environment Variables:</p>
      <ul>
        <li>VITE_SUPABASE_URL: {import.meta.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing'}</li>
        <li>VITE_SUPABASE_ANON_KEY: {import.meta.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}</li>
        <li>NODE_ENV: {import.meta.env.NODE_ENV}</li>
      </ul>
      <button onClick={() => alert('Button works!')}>
        Test Button
      </button>
    </div>
  )
}

export default TestApp