import app
import time

email = f'testflow{int(time.time())}@example.com'
username = None
app_id = None

client = app.app.test_client()
try:
    # 1. Submit application
    r = client.post('/api/applications', json={
        'full_name': 'Test Flow User',
        'email': email,
        'phone': '5551234567',
        'business_name': 'Test Flow Business',
        'business_address': 'Test Flow Address',
        'description': 'End-to-end flow test'
    })
    assert r.status_code == 201, r.get_json()
    app_id = r.get_json()['id']
    print('OK: submit application')

    # 2. Admin login
    r = client.post('/api/auth/login', json={'username': 'admin', 'password': 'EnnerVal1453'})
    assert r.status_code == 200, r.get_json()
    admin_headers = {'Authorization': 'Bearer ' + r.get_json()['token']}

    # 3. List and find application
    r = client.get('/api/applications', headers=admin_headers)
    assert r.status_code == 200, r.get_json()
    assert any(a['email'] == email for a in r.get_json())
    print('OK: list applications')

    # 4. Approve application
    r = client.post(f'/api/applications/{app_id}/review', json={'action': 'approve'}, headers=admin_headers)
    assert r.status_code == 200, r.get_json()
    res = r.get_json()
    username = res['username']
    temp_password = res['temp_password']
    print('OK: approve application ->', username)

    # 5. First login with temp password
    r = client.post('/api/auth/login', json={'username': username, 'password': temp_password})
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data['user']['force_password_change'] is True
    assert data['user']['business_info_completed'] is False
    user_headers = {'Authorization': 'Bearer ' + data['token']}
    print('OK: first login with temp password')

    # 6. Force password change
    r = client.post('/api/users/force-change-password', json={
        'old_password': temp_password,
        'new_password': 'NewSecurePass123'
    }, headers=user_headers)
    assert r.status_code == 200, r.get_json()
    print('OK: force password change')

    # 7. Complete business profile
    r = client.put('/api/business-profile', json={
        'business_name': 'Test Flow Business',
        'authorized_name': 'Test Flow User',
        'phone': '5551234567',
        'email': email,
        'address': 'Test Flow Address',
        'city': 'İstanbul',
        'district': 'Kadıköy',
        'tax_number': '1234567890',
        'tax_office': 'Kadıköy',
        'logo_url': ''
    }, headers=user_headers)
    assert r.status_code == 200, r.get_json()
    print('OK: complete business profile')

    # 8. Login with new password
    r = client.post('/api/auth/login', json={'username': username, 'password': 'NewSecurePass123'})
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data['user']['force_password_change'] is False
    assert data['user']['business_info_completed'] is True
    user_headers = {'Authorization': 'Bearer ' + data['token']}
    print('OK: final login with new password')

    # 9. Access main system as normal user
    r = client.get('/api/products', headers=user_headers)
    assert r.status_code == 200, r.get_json()
    print('OK: access products after onboarding')

    print('REGISTRATION FLOW PASSED')
finally:
    try:
        r = client.post('/api/auth/login', json={'username': 'admin', 'password': 'EnnerVal1453'})
        if r.status_code == 200:
            headers = {'Authorization': 'Bearer ' + r.get_json()['token']}
            if app_id:
                client.delete(f'/api/applications/{app_id}', headers=headers)
            if username:
                r2 = client.get('/api/users', headers=headers)
                if r2.status_code == 200:
                    for u in r2.get_json():
                        if u['username'] == username:
                            client.delete(f"/api/users/{u['id']}", headers=headers)
    except Exception as e:
        print('Cleanup skipped:', e)
